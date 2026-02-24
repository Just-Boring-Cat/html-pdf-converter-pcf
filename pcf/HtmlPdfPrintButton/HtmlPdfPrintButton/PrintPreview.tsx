import * as React from "react";
import { ButtonAppearance, ButtonSize, PrintButton } from "./PrintButton";
import html2canvas from "html2canvas";
import { PDFDocument } from "pdf-lib";

export interface PrintPreviewProps {
  html: string;
  title: string;
  additionalCss?: string;
  heightPx?: number;
  buttonLabel: string;
  downloadLabel: string;
  buttonAppearance: ButtonAppearance;
  buttonSize: ButtonSize;
  buttonWidth?: number;
  buttonHeight?: number;
  buttonBackgroundColor?: string;
  buttonTextColor?: string;
  buttonBorderColor?: string;
  buttonBorderWidth?: number;
  buttonBorderRadius?: number;
  showPrintButton: boolean;
  showDownloadButton: boolean;
  downloadFileName: string;
  onBeforePrint: () => void;
  onBeforeDownload: () => void;
  onPdfOutput?: (update: PdfOutputUpdate) => void;
  commandRequest?: CommandRequest;
  onCommandResult?: (result: CommandResult) => void;
}

export type CommandAction = "print" | "download";

export interface CommandRequest {
  id: string;
  action: CommandAction;
  raw: string;
}

export interface CommandResult {
  id: string;
  action: CommandAction;
  status: "completed" | "error";
  message?: string;
}

export interface PdfOutputUpdate {
  status: "idle" | "generating" | "ready" | "error";
  base64?: string;
  fileName?: string;
  message?: string;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return c;
    }
  });
}

function buildSrcDoc(options: { html: string; title: string; additionalCss?: string }): string {
  const safeTitle = escapeHtml(options.title || "Document");
  const additionalCss = options.additionalCss ? `\n/* additionalCss */\n${options.additionalCss}\n` : "";

  // The HTML is treated as trusted input; we still avoid executing scripts by sandboxing the iframe.
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: light; }
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      img { max-width: 100%; }
      table { border-collapse: collapse; }
      th, td { vertical-align: top; }
      th, td, p, div, span, li {
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      pre, .tbc-preserve-lines, [data-tbc-preserve-lines="true"] {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      @page { margin: 12mm; }
      ${additionalCss}
    </style>
  </head>
  <body>
    ${options.html}
  </body>
</html>`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("Failed to convert PDF blob to base64."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read PDF blob."));
    reader.readAsDataURL(blob);
  });
}

export function PrintPreview(props: PrintPreviewProps): React.ReactElement {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [pendingCommand, setPendingCommand] = React.useState<CommandRequest | null>(null);
  const lastQueuedCommandRawRef = React.useRef("");
  const executingCommandRawRef = React.useRef("");
  const completedCommandRawRef = React.useRef("");
  const downloadInFlightRef = React.useRef(false);
  const lastDownloadStartedAtRef = React.useRef(0);

  const srcDoc = React.useMemo(
    () => buildSrcDoc({ html: props.html, title: props.title, additionalCss: props.additionalCss }),
    [props.html, props.title, props.additionalCss]
  );

  React.useEffect(() => {
    setReady(false);
  }, [srcDoc]);

  const rootStyle: React.CSSProperties = {
    width: "100%",
    height: props.heightPx && props.heightPx > 0 ? `${props.heightPx}px` : "100%",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  const toolbarStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: "0 0 auto",
  };

  const iframeStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid #e1e1e1",
    borderRadius: 6,
    flex: "1 1 auto",
    minHeight: 0,
  };

  const handlePrint = React.useCallback((): void => {
    if (!ready) {
      throw new Error("Preview is not ready yet.");
    }
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      throw new Error("Preview iframe is not available.");
    }
    props.onBeforePrint();
    win.focus();
    win.print();
  }, [props.onBeforePrint, ready]);

  const handleDownload = React.useCallback(async (): Promise<void> => {
    if (!ready) {
      throw new Error("Preview is not ready yet.");
    }
    if (downloading || downloadInFlightRef.current) {
      throw new Error("A download is already in progress.");
    }
    const now = Date.now();
    if (now - lastDownloadStartedAtRef.current < 1500) {
      return;
    }
    lastDownloadStartedAtRef.current = now;
    downloadInFlightRef.current = true;

    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    const win = iframe?.contentWindow;
    if (!doc || !win) {
      downloadInFlightRef.current = false;
      throw new Error("Preview iframe is not available.");
    }

    props.onBeforeDownload();
    props.onPdfOutput?.({ status: "generating" });
    setDownloading(true);
    try {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.setTitle(props.title || "Document");

      // A4 page size in points: 595.28 × 841.89
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 36; // 0.5"

      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const canvasOptionsBase = {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: false,
        logging: false,
        windowWidth: doc.documentElement.scrollWidth,
        windowHeight: doc.documentElement.scrollHeight,
      } as const;

      const isIgnorableNode = (node: Node): boolean => {
        return node.nodeType === 3 && !(node.textContent || "").trim();
      };

      const addCanvasAsSinglePage = async (canvas: HTMLCanvasElement): Promise<void> => {
        const pngDataUrl = canvas.toDataURL("image/png");
        const pngBytes = await (await fetch(pngDataUrl)).arrayBuffer();
        const png = await pdfDoc.embedPng(pngBytes);

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        const scale = Math.min(availableWidth / png.width, availableHeight / png.height);
        const scaledWidth = png.width * scale;
        const scaledHeight = png.height * scale;
        const x = margin + (availableWidth - scaledWidth) / 2;
        const y = pageHeight - margin - scaledHeight;
        page.drawImage(png, { x, y, width: scaledWidth, height: scaledHeight });
      };

      const addCanvasAsSlicedPages = async (canvas: HTMLCanvasElement): Promise<void> => {
        const pngDataUrl = canvas.toDataURL("image/png");
        const pngBytes = await (await fetch(pngDataUrl)).arrayBuffer();
        const png = await pdfDoc.embedPng(pngBytes);

        const scale = availableWidth / png.width; // fit-to-page width
        const scaledWidth = availableWidth;
        const scaledHeight = png.height * scale;

        let offsetY = 0;
        while (offsetY < scaledHeight) {
          const page = pdfDoc.addPage([pageWidth, pageHeight]);
          const y = pageHeight - margin - scaledHeight + offsetY;
          page.drawImage(png, { x: margin, y, width: scaledWidth, height: scaledHeight });
          offsetY += availableHeight;
        }
      };

      const renderNodeSegmentAsCanvas = async (nodes: Node[]): Promise<HTMLCanvasElement | null> => {
        const significant = nodes.filter((node) => !isIgnorableNode(node));
        if (significant.length === 0) return null;

        const host = doc.createElement("div");
        host.setAttribute("data-tbc-pdf-segment", "true");
        host.style.position = "fixed";
        host.style.left = "-100000px";
        host.style.top = "0";
        host.style.width = `${Math.max(doc.body.scrollWidth, doc.documentElement.scrollWidth, 1)}px`;
        host.style.background = "#ffffff";
        host.style.zIndex = "-1";

        for (const node of nodes) {
          host.appendChild(node.cloneNode(true));
        }

        doc.body.appendChild(host);
        try {
          return await html2canvas(host, {
            ...canvasOptionsBase,
            width: host.scrollWidth || host.offsetWidth || undefined,
            height: host.scrollHeight || host.offsetHeight || undefined,
          });
        } finally {
          doc.body.removeChild(host);
        }
      };

      const renderRangeSegmentAsCanvas = async (range: Range): Promise<HTMLCanvasElement | null> => {
        const fragment = range.cloneContents();
        const nodes = Array.from(fragment.childNodes);
        return renderNodeSegmentAsCanvas(nodes);
      };

      const pageMarkerDivs = Array.from(
        doc.querySelectorAll<HTMLDivElement>("div[id='page'], div[id^='page-']")
      );
      const hasPageMarkers = pageMarkerDivs.length > 0;

      if (hasPageMarkers) {
        for (let index = 0; index < pageMarkerDivs.length; index += 1) {
          const range = doc.createRange();
          if (index === 0) {
            range.setStart(doc.body, 0);
          } else {
            range.setStartBefore(pageMarkerDivs[index]);
          }

          if (index + 1 < pageMarkerDivs.length) {
            range.setEndBefore(pageMarkerDivs[index + 1]);
          } else {
            range.setEnd(doc.body, doc.body.childNodes.length);
          }

          const canvas = await renderRangeSegmentAsCanvas(range);
          range.detach();
          if (!canvas) {
            continue;
          }
          await addCanvasAsSinglePage(canvas);
        }

      } else {
        const element = doc.documentElement;
        const canvas = await html2canvas(element, {
          ...canvasOptionsBase,
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
        });
        await addCanvasAsSlicedPages(canvas);
      }

      const pdfBytes = await pdfDoc.save();
      const pdfCopy = new Uint8Array(pdfBytes.byteLength);
      pdfCopy.set(pdfBytes);
      const blob = new Blob([pdfCopy], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const name = (props.downloadFileName || "document.pdf").trim();
      const downloadName = name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
      const pdfBase64 = await blobToDataUrl(blob);

      props.onPdfOutput?.({
        status: "ready",
        base64: pdfBase64,
        fileName: downloadName,
      });

      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      win.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate PDF output.";
      props.onPdfOutput?.({
        status: "error",
        message,
      });
      throw error;
    } finally {
      downloadInFlightRef.current = false;
      setDownloading(false);
    }
  }, [downloading, props.downloadFileName, props.onBeforeDownload, props.onPdfOutput, props.title, ready]);

  React.useEffect(() => {
    const command = props.commandRequest;
    if (!command?.raw.trim()) {
      return;
    }
    if (command.raw === lastQueuedCommandRawRef.current) {
      return;
    }
    lastQueuedCommandRawRef.current = command.raw;
    setPendingCommand(command);
  }, [props.commandRequest]);

  React.useEffect(() => {
    if (!pendingCommand) {
      return;
    }
    if (executingCommandRawRef.current === pendingCommand.raw) {
      return;
    }
    if (completedCommandRawRef.current === pendingCommand.raw) {
      setPendingCommand(null);
      return;
    }
    if (!props.html.trim()) {
      props.onCommandResult?.({
        id: pendingCommand.id,
        action: pendingCommand.action,
        status: "error",
        message: "No HTML content is available.",
      });
      setPendingCommand(null);
      return;
    }
    if (!ready || downloading) {
      return;
    }

    executingCommandRawRef.current = pendingCommand.raw;
    const execute = async (): Promise<void> => {
      try {
        if (pendingCommand.action === "print") {
          handlePrint();
        } else {
          await handleDownload();
        }
        props.onCommandResult?.({
          id: pendingCommand.id,
          action: pendingCommand.action,
          status: "completed",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Command failed.";
        props.onCommandResult?.({
          id: pendingCommand.id,
          action: pendingCommand.action,
          status: "error",
          message,
        });
      } finally {
        completedCommandRawRef.current = pendingCommand.raw;
        executingCommandRawRef.current = pendingCommand.raw;
        setPendingCommand(null);
      }
    };

    void execute();
  }, [downloading, handleDownload, handlePrint, pendingCommand, props.html, props.onCommandResult, ready]);

  return (
    <div style={rootStyle}>
      <div style={toolbarStyle}>
        {props.showPrintButton ? (
          <PrintButton
            disabled={!props.html.trim() || !ready || downloading}
            label={props.buttonLabel}
            appearance={props.buttonAppearance}
            size={props.buttonSize}
            width={props.buttonWidth}
            height={props.buttonHeight}
            backgroundColor={props.buttonBackgroundColor}
            textColor={props.buttonTextColor}
            borderColor={props.buttonBorderColor}
            borderWidth={props.buttonBorderWidth}
            borderRadius={props.buttonBorderRadius}
            onClick={() => {
              try {
                handlePrint();
              } catch {
                // no-op
              }
            }}
          />
        ) : null}

        {props.showDownloadButton ? (
          <PrintButton
            disabled={!props.html.trim() || !ready || downloading}
            label={downloading ? "Downloading..." : props.downloadLabel}
            appearance={props.buttonAppearance}
            size={props.buttonSize}
            width={props.buttonWidth}
            height={props.buttonHeight}
            backgroundColor={props.buttonBackgroundColor}
            textColor={props.buttonTextColor}
            borderColor={props.buttonBorderColor}
            borderWidth={props.buttonBorderWidth}
            borderRadius={props.buttonBorderRadius}
            onClick={() => {
              void handleDownload().catch(() => undefined);
            }}
          />
        ) : null}

      </div>
      <iframe
        ref={iframeRef}
        title={props.title || "Document"}
        srcDoc={srcDoc}
        style={iframeStyle}
        sandbox="allow-same-origin allow-modals"
        onLoad={() => setReady(true)}
      />
    </div>
  );
}
