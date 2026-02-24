# Solution Package (Canvas app import)

This repo includes a Dataverse solution project that packages the PCF control so it can be imported into an environment and used in a canvas app.

## Solution Name
- Dataverse unique name: `Html_to_PDF_Component_Solution`

## Publisher
- Publisher name: `The Boring Cat`
- Prefix: `tbc`

Note: the solution uses a Dataverse publisher **Unique Name** of `TheBoringCat` (no spaces), with the localized display name set to `The Boring Cat`.

## Build the solution zip
From the repo root:

1) Build the solution package (this triggers the PCF build and packs the solution):
   - `dotnet build solution/Html_to_PDF_Component_Solution/Html_to_PDF_Component_Solution.cdsproj -c Release`

Notes:
- The solution build now auto-increments the patch version for both:
  - PCF control manifest version
  - Dataverse solution version
- To skip the version bump for a specific build:
  - `dotnet build ... -p:SkipVersionBump=true`
- `npm run build` in the PCF folder does **not** bump versions, only the solution `dotnet build` path does.

The solution zip is produced under:
- `solution/Html_to_PDF_Component_Solution/bin/Release/`

Outputs:
- `Html_to_PDF_Component_Solution.zip` (unmanaged)
- `Html_to_PDF_Component_Solution_managed.zip` (managed)

## Import into an environment
1) Power Apps / Power Platform admin center → Solutions → Import.
2) Select the generated `.zip`.
3) After import, the code component is available for canvas apps.

If new PCF properties/outputs do not appear immediately in Power Apps Studio:
- close the app designer tab completely
- hard refresh the browser (`Ctrl+F5` / `Cmd+Shift+R`)
- remove and re-add the control in the app
- if still stale, reimport the updated solution and try in an incognito window

## Use in a canvas app
1) In a canvas app, insert the code component.
2) Set the `html` input to your HTML string.
3) Configure action/appearance properties (show/hide print/download, colors, line-break token, etc.).
4) Use page markers (`<div id='page'>...</div>`) when you need one PDF page per logical segment.
