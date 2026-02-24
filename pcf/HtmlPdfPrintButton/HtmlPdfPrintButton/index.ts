import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { PrintButton, ButtonAppearance, ButtonSize } from "./PrintButton";
import { PrintPreview, CommandAction, CommandRequest, CommandResult, PdfOutputUpdate } from "./PrintPreview";
import * as React from "react";

type AlertFn = (message: string) => void;
const DEFAULT_LINE_BREAK_TOKEN = "<!-- linebreak -->";

function cssColorOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    return CSS.supports("color", trimmed) ? trimmed : undefined;
  }
  return trimmed;
}

function asAppearance(value: string | null | undefined): ButtonAppearance {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "primary" || v === "secondary" || v === "outline" || v === "subtle" || v === "transparent") {
    return v;
  }
  return "primary";
}

function asSize(value: string | null | undefined): ButtonSize {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "small" || v === "medium" || v === "large") return v;
  return "medium";
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

function openPrintPopup(options: {
  html: string;
  title: string;
  popupWidth: number;
  popupHeight: number;
  additionalCss?: string;
  autoPrint: boolean;
  alert: AlertFn;
}): boolean {
  const w = Math.max(200, Math.floor(options.popupWidth || 1000));
  const h = Math.max(200, Math.floor(options.popupHeight || 800));
  const left = Math.max(0, Math.floor((window.screen.width - w) / 2));
  const top = Math.max(0, Math.floor((window.screen.height - h) / 2));
  const features = `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;

  const win = window.open("", "_blank", features);
  if (!win || win.closed) {
    options.alert("Popup blocked. Please allow popups for this site and try again.");
    return false;
  }

  const safeTitle = escapeHtml(options.title || "Document");
  const additionalCss = options.additionalCss ? `\n/* additionalCss */\n${options.additionalCss}\n` : "";

  win.document.open();
  win.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      .toolbar {
        position: sticky; top: 0; z-index: 10;
        display: flex; gap: 8px; align-items: center;
        padding: 10px 12px;
        border-bottom: 1px solid #e5e5e5;
        background: #ffffff;
      }
      .toolbar button {
        appearance: none;
        border: 1px solid #d1d1d1;
        background: #f7f7f7;
        padding: 8px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      }
      .toolbar button:hover { background: #efefef; }
      .content { padding: 16px; }
      img { max-width: 100%; }

      @media print {
        .toolbar { display: none !important; }
        .content { padding: 0; }
      }

      @page { margin: 12mm; }
      ${additionalCss}
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button type="button" id="pcf-print">Print</button>
      <button type="button" id="pcf-close">Close</button>
    </div>
    <div class="content" id="pcf-content"></div>
  </body>
</html>`);
  win.document.close();

  const content = win.document.getElementById("pcf-content");
  if (content) content.innerHTML = options.html;

  const printBtn = win.document.getElementById("pcf-print") as HTMLButtonElement | null;
  const closeBtn = win.document.getElementById("pcf-close") as HTMLButtonElement | null;
  if (printBtn) printBtn.addEventListener("click", () => win.print());
  if (closeBtn) closeBtn.addEventListener("click", () => win.close());

  if (options.autoPrint) {
    // give the browser a tick to layout before printing
    win.setTimeout(() => win.print(), 250);
  }
  return true;
}

type RenderMode = "inline" | "popup";

function asRenderMode(value: string | null | undefined): RenderMode {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "popup") return "popup";
  return "inline";
}

function warnOnUnsupportedAssets(html: string, alert: AlertFn): void {
  const maxImageBytes = 500 * 1024;
  let checked = 0;
  let remoteImageCount = 0;
  let oversizeImageCount = 0;

  const imgSrcRegex = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgSrcRegex.exec(html)) && checked < 25) {
    checked += 1;
    const src = match[1].trim();

    if (/^(https?:)?\/\//i.test(src)) {
      remoteImageCount += 1;
      continue;
    }

    const base64Marker = ";base64,";
    const idx = src.toLowerCase().indexOf(base64Marker);
    if (idx === -1) continue;

    const base64 = src.slice(idx + base64Marker.length);
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    const bytes = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
    if (bytes > maxImageBytes) oversizeImageCount += 1;
  }

  if (remoteImageCount > 0) {
    alert(
      `This HTML includes ${remoteImageCount} remote image(s). v1 assumes base64-only images; remote assets may fail due to CORS/DLP or leak metadata.`
    );
  }

  if (oversizeImageCount > 0) {
    alert(
      `This HTML includes ${oversizeImageCount} base64 image(s) larger than 500 KB. Printing may be slow or fail; consider compressing images.`
    );
  }
}

function normalizeLineBreakToken(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || DEFAULT_LINE_BREAK_TOKEN;
}

function applyLineBreakToken(html: string, token: string): string {
  if (!html || !token) return html;
  if (!html.includes(token)) return html;
  return html.split(token).join("<br />");
}

type CommandStatus = "completed" | "error";

interface CommandAck {
  id: string;
  action: string;
  status: CommandStatus;
  message?: string;
  timestamp: string;
}

interface ParseCommandResult {
  command?: CommandRequest;
  error?: string;
}

function parseActionCommand(raw: string): ParseCommandResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Invalid actionCommand JSON." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "actionCommand must be a JSON object." };
  }

  const candidate = parsed as { id?: unknown; action?: unknown };
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const actionRaw = typeof candidate.action === "string" ? candidate.action.trim().toLowerCase() : "";

  if (!id) {
    return { error: "actionCommand.id is required." };
  }
  if (actionRaw !== "print" && actionRaw !== "download") {
    return { error: 'actionCommand.action must be "print" or "download".' };
  }

  return {
    command: {
      id,
      action: actionRaw as CommandAction,
      raw,
    },
  };
}

export class HtmlToPdfComponent implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private context!: ComponentFramework.Context<IInputs>;
  private notifyOutputChanged?: () => void;
  private lastCommandAck = "";
  private htmlText = "";
  private htmlTextRaw = "";
  private pdfBase64 = "";
  private pdfFileName = "";
  private pdfStatus = "idle";
  private lastActionCommandRaw = "";
  private pendingInlineCommand: CommandRequest | undefined;

  public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void, state: ComponentFramework.Dictionary): void {
    this.context = context;
    this.notifyOutputChanged = notifyOutputChanged;
  }

  private updateCommandAck(ack: Omit<CommandAck, "timestamp">): void {
    this.lastCommandAck = JSON.stringify({
      ...ack,
      timestamp: new Date().toISOString(),
    });
    this.notifyOutputChanged?.();
  }

  private handlePdfOutput(update: PdfOutputUpdate): void {
    if (update.status === "generating") {
      this.pdfStatus = "generating";
      this.pdfBase64 = "";
      this.pdfFileName = "";
    } else if (update.status === "ready") {
      this.pdfStatus = "ready";
      this.pdfBase64 = update.base64 ?? "";
      this.pdfFileName = update.fileName ?? "";
    } else if (update.status === "error") {
      this.pdfStatus = "error";
      this.pdfBase64 = "";
      this.pdfFileName = "";
    } else {
      this.pdfStatus = "idle";
      this.pdfBase64 = "";
      this.pdfFileName = "";
    }
    this.notifyOutputChanged?.();
  }

  private handlePopupCommand(command: CommandRequest, options: {
    html: string;
    title: string;
    popupWidth: number;
    popupHeight: number;
    additionalCss?: string;
    autoPrint: boolean;
    alert: AlertFn;
  }): void {
    if (!options.html.trim()) {
      this.updateCommandAck({
        id: command.id,
        action: command.action,
        status: "error",
        message: "No HTML content is available.",
      });
      return;
    }

    if (command.action === "download") {
      this.updateCommandAck({
        id: command.id,
        action: command.action,
        status: "error",
        message: 'Download command is only supported in "inline" renderMode.',
      });
      return;
    }

    warnOnUnsupportedAssets(options.html, options.alert);
    const opened = openPrintPopup(options);

    this.updateCommandAck({
      id: command.id,
      action: command.action,
      status: opened ? "completed" : "error",
      message: opened ? undefined : "Popup blocked. Please allow popups for this site and try again.",
    });
  }

  private handleInlineCommandResult(result: CommandResult): void {
    this.pendingInlineCommand = undefined;
    this.updateCommandAck({
      id: result.id,
      action: result.action,
      status: result.status,
      message: result.message,
    });
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    this.context = context;

    const html = context.parameters.html.raw ?? "";
    const disabled = !html.trim();

    const label = (context.parameters.buttonLabel.raw ?? "Print").trim() || "Print";
    const appearance = asAppearance(context.parameters.buttonAppearance.raw);
    const size = asSize(context.parameters.buttonSize.raw);

    const width = context.parameters.buttonWidth.raw ?? undefined;
    const height = context.parameters.buttonHeight.raw ?? undefined;
    const backgroundColor = cssColorOrUndefined(context.parameters.buttonBackgroundColor.raw);
    const textColor = cssColorOrUndefined(context.parameters.buttonTextColor.raw);
    const borderColor = cssColorOrUndefined(context.parameters.buttonBorderColor.raw);
    const borderWidth = context.parameters.buttonBorderWidth.raw ?? undefined;
    const borderRadius = context.parameters.buttonBorderRadius.raw ?? undefined;

    const title = (context.parameters.popupTitle.raw ?? "Document").trim() || "Document";
    const popupWidth = context.parameters.popupWidth.raw ?? 1000;
    const popupHeight = context.parameters.popupHeight.raw ?? 800;
    const additionalCss = context.parameters.additionalCss.raw ?? undefined;
    const lineBreakToken = normalizeLineBreakToken(context.parameters.lineBreakToken.raw);
    const autoPrint = Boolean(context.parameters.autoPrint.raw);

    const renderMode = asRenderMode(context.parameters.renderMode.raw);
    const previewHeight = context.parameters.previewHeight.raw ?? undefined;

    const showPrintButton = Boolean(context.parameters.showPrintButton.raw ?? true);
    const showDownloadButton = Boolean(context.parameters.showDownloadButton.raw);
    const downloadLabel = (context.parameters.downloadButtonLabel.raw ?? "Download PDF").trim() || "Download PDF";
    const downloadFileName = (context.parameters.downloadFileName.raw ?? "document.pdf").trim() || "document.pdf";
    const actionCommandRaw = (context.parameters.actionCommand.raw ?? "").trim();
    const htmlWithLineBreaks = applyLineBreakToken(html, lineBreakToken);

    let htmlOutputChanged = false;
    if (this.htmlText !== htmlWithLineBreaks) {
      this.htmlText = htmlWithLineBreaks;
      htmlOutputChanged = true;
    }
    if (this.htmlTextRaw !== html) {
      this.htmlTextRaw = html;
      htmlOutputChanged = true;
    }
    if (htmlOutputChanged) {
      this.notifyOutputChanged?.();
    }

    const alert: AlertFn = (message) => {
      if (context.navigation?.openAlertDialog) {
        void context.navigation.openAlertDialog({ text: message });
        return;
      }
      window.alert(message);
    };

    if (actionCommandRaw !== this.lastActionCommandRaw) {
      this.lastActionCommandRaw = actionCommandRaw;
      if (actionCommandRaw) {
        const parsedCommand = parseActionCommand(actionCommandRaw);
        if (!parsedCommand.command) {
          this.updateCommandAck({
            id: "",
            action: "unknown",
            status: "error",
            message: parsedCommand.error ?? "Invalid command.",
          });
        } else if (renderMode === "popup") {
          this.handlePopupCommand(parsedCommand.command, {
            html: htmlWithLineBreaks,
            title,
            popupWidth,
            popupHeight,
            additionalCss,
            autoPrint,
            alert,
          });
        } else {
          this.pendingInlineCommand = parsedCommand.command;
        }
      }
    }

    if (renderMode === "popup") {
      if (!showPrintButton) {
        return React.createElement("div", {});
      }
      return React.createElement(PrintButton, {
        disabled,
        label,
        appearance,
        size,
        width: typeof width === "number" ? width : undefined,
        height: typeof height === "number" ? height : undefined,
        backgroundColor,
        textColor,
        borderColor,
        borderWidth: typeof borderWidth === "number" ? borderWidth : undefined,
        borderRadius: typeof borderRadius === "number" ? borderRadius : undefined,
        onClick: () => {
          warnOnUnsupportedAssets(htmlWithLineBreaks, alert);
          openPrintPopup({
            html: htmlWithLineBreaks,
            title,
            popupWidth,
            popupHeight,
            additionalCss,
            autoPrint,
            alert,
          });
        },
      });
    }

    const allocatedHeight = context.mode.allocatedHeight;
    const inlineHeight =
      typeof previewHeight === "number"
        ? previewHeight
        : typeof allocatedHeight === "number" && allocatedHeight > 0
          ? allocatedHeight
          : 650;

    return React.createElement(PrintPreview, {
      html: htmlWithLineBreaks,
      title,
      additionalCss,
      heightPx: inlineHeight,
      buttonLabel: label,
      downloadLabel,
      buttonAppearance: appearance,
      buttonSize: size,
      buttonWidth: typeof width === "number" ? width : undefined,
      buttonHeight: typeof height === "number" ? height : undefined,
      buttonBackgroundColor: backgroundColor,
      buttonTextColor: textColor,
      buttonBorderColor: borderColor,
      buttonBorderWidth: typeof borderWidth === "number" ? borderWidth : undefined,
      buttonBorderRadius: typeof borderRadius === "number" ? borderRadius : undefined,
      showPrintButton,
      showDownloadButton,
      downloadFileName,
      onBeforePrint: () => warnOnUnsupportedAssets(htmlWithLineBreaks, alert),
      onBeforeDownload: () => warnOnUnsupportedAssets(htmlWithLineBreaks, alert),
      onPdfOutput: (update: PdfOutputUpdate) => this.handlePdfOutput(update),
      commandRequest: this.pendingInlineCommand,
      onCommandResult: (result: CommandResult) => this.handleInlineCommandResult(result),
    });
  }

  public getOutputs(): IOutputs {
    return {
      lastCommandAck: this.lastCommandAck,
      htmlText: this.htmlText,
      htmlTextRaw: this.htmlTextRaw,
      pdfBase64: this.pdfBase64,
      pdfFileName: this.pdfFileName,
      pdfStatus: this.pdfStatus,
    };
  }

  public destroy(): void {
    // no-op
  }
}
