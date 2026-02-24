# PCF Usage (Canvas app)

## What this control does
- By default (`renderMode=inline`), renders the provided HTML inside the control (iframe) with a **Print** button.
- Clicking **Print** opens the browser print dialog; the user chooses **Save as PDF**.
- Optional **Download PDF** action generates a PDF directly in the browser (no Power Automate required).
- Optional (`renderMode=popup`): opens a popup window and prints from there (legacy behavior).

## Typical setup (canvas)
1) Add the PCF code component to your canvas app (via a Dataverse solution package you build from this repo or import from a release asset).
2) Set the component `html` input to your HTML string expression/variable.
3) Configure the component’s appearance inputs (label, size, colors, popup size, optional CSS).

## Input properties
- `html` (input): HTML string to render in the preview/popup and use for PDF generation.
- `buttonLabel`: button text (default `Print`).
- `buttonAppearance`: `primary | secondary | outline | subtle | transparent` (default `primary`).
- `buttonSize`: `small | medium | large` (default `medium`).
- `buttonWidth`, `buttonHeight`: pixels (optional).
- `buttonBackgroundColor`, `buttonTextColor`: CSS color values (optional, e.g. `#0f6cbd`).
- `buttonBorderColor`, `buttonBorderWidth`, `buttonBorderRadius`: optional border styling.
- `popupTitle`: popup window title (default `Document`).
- `popupWidth`, `popupHeight`: popup size in pixels.
- `additionalCss`: extra CSS appended to the popup `<style>` (useful for `@media print` and page breaks).
- `lineBreakToken`: token replaced before render/PDF (default `<!-- linebreak -->`). Matching tokens are converted to `<br />`.
- `autoPrint`: when enabled, opens the popup and triggers the print dialog after layout.
- `renderMode`: `inline` (default) or `popup`.
- `previewHeight`: inline preview height (px). When not provided, it uses the control height (`Self.Height`).
- `showPrintButton`: show/hide the Print button (default `true`).
- `showDownloadButton`: show/hide the Download button (default `false`).
- `downloadButtonLabel`: download button text (default `Download PDF`).
- `downloadFileName`: downloaded filename (default `document.pdf`).
- `actionCommand`: optional JSON command to trigger actions from Canvas buttons, format `{"id":"<guid>","action":"print|download"}`.

## Output properties
- `lastCommandAck`: JSON acknowledgment for the latest `actionCommand`, format `{"id":"...","action":"...","status":"completed|error","message":"...","timestamp":"..."}`.
- `pdfBase64`: last generated PDF as data URL/base64 text (`data:application/pdf;base64,...`).
- `pdfFileName`: generated PDF file name.
- `pdfStatus`: PDF output state (`idle`, `generating`, `ready`, `error`).
- `htmlText`: transformed HTML after `lineBreakToken` replacement (for diagnostics / downstream use).
- `htmlTextRaw`: raw HTML input before any token replacement.

## Canvas trigger pattern
1) Bind the PCF property `ActionCommand` to a variable, for example `varPdfCmd`.
2) Print button `OnSelect`:
   `Set(varPdfCmd, "{""id"":""" & GUID() & """,""action"":""print""}")`
3) Download button `OnSelect`:
   `Set(varPdfCmd, "{""id"":""" & GUID() & """,""action"":""download""}")`
4) Optional: inspect `MyPdfControl.LastCommandAck` to confirm completion or show errors.

Notes:
- Use a new `id` each click so repeated commands are detected.
- `download` command is supported in `renderMode=inline`.
- In `renderMode=popup`, only `print` is supported by command.

## Canvas to Flow contract
Use this when you want to save the generated PDF to SharePoint via Power Automate.

1) Wait for output readiness:
   - `MyPdfControl.pdfStatus = "ready"`
2) Call your flow:
   - `SavePdfToSharePoint.Run(MyPdfControl.pdfFileName, MyPdfControl.pdfBase64)`
3) In Flow (`Power Apps (V2)`), create the SharePoint file content from base64:
   - `base64ToBinary(last(split(triggerBody()['fileContentBase64'],',')))`

Notes:
- This expression works for both plain base64 and `data:application/pdf;base64,...`.
- For larger PDFs, prefer server-side conversion/upload due to Power Apps and Flow payload limits.

## Download notes
- The **Download PDF** button generates a PDF client-side by screenshotting the rendered HTML and fitting it to the PDF page width.
- The output is typically **rasterized** (not selectable/searchable text) and large/long documents can be slow.
- Long words/IDs/file names are wrapped by default (`overflow-wrap:anywhere`, `word-break:break-word`) to reduce clipped content.

## HTML rules (v1)
- HTML is treated as **trusted** input.
- Images should be embedded as **base64 data URIs** and kept to **≤ 500 KB per image** (recommendation/contract).
- To preserve plain text newlines without changing source generation, insert the configured token (default `<!-- linebreak -->`).
- For content that already contains real newline characters, use `.tbc-preserve-lines` or `data-tbc-preserve-lines="true"` and `white-space: pre-wrap`.

## PDF page segmentation (page markers)
- Preferred page boundary marker: `div` with `id="page"` (also supports `id="page-1"`, `id="page-2"`, etc.).
- When markers are present, the exporter builds PDF pages from the full HTML flow:
  - content before the first page marker is included in page 1
  - content between markers is included in the page segment until the next marker
  - content after the last marker is included in the last page
- This preserves headers/footers/interstitial HTML outside page divs.

Important:
- `<!-- linebreak -->` is for line breaks only, not page breaks.
- Use page marker divs (or a future dedicated page-break token) for PDF page boundaries.

## Local testing (PCF test harness)
- `cd pcf/HtmlPdfPrintButton`
- `npm install`
- `npm run refreshTypes`
- `npm run start`
- In the harness property pane, paste a sample HTML string into `html` and click the button.
- Test page segmentation with nested markers too, not only direct `body` children.

## Print CSS tips
- Use `@media print` to hide any screen-only elements.
- For pagination, prefer modern break properties:
  - `break-before: page;`
  - `break-after: page;`
  - `break-inside: avoid;`
