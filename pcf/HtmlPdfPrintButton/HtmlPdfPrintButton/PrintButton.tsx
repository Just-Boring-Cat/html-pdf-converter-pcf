import * as React from "react";
import { Button } from "@fluentui/react-components";

export type ButtonAppearance = "primary" | "secondary" | "outline" | "subtle" | "transparent";
export type ButtonSize = "small" | "medium" | "large";

export interface PrintButtonProps {
  disabled: boolean;
  label: string;
  appearance: ButtonAppearance;
  size: ButtonSize;
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  onClick: () => void;
}

export function PrintButton(props: PrintButtonProps): React.ReactElement {
  const style: React.CSSProperties = {};

  if (props.width && props.width > 0) style.width = `${props.width}px`;
  if (props.height && props.height > 0) style.height = `${props.height}px`;
  if (props.backgroundColor) style.backgroundColor = props.backgroundColor;
  if (props.textColor) style.color = props.textColor;
  if (props.borderRadius !== undefined && props.borderRadius >= 0) style.borderRadius = `${props.borderRadius}px`;

  if (props.borderWidth !== undefined || props.borderColor) {
    const w = props.borderWidth !== undefined && props.borderWidth >= 0 ? props.borderWidth : 1;
    const c = props.borderColor ?? "currentColor";
    style.border = `${w}px solid ${c}`;
  }

  return (
    <Button
      appearance={props.appearance}
      size={props.size}
      disabled={props.disabled}
      onClick={props.onClick}
      style={style}
    >
      {props.label}
    </Button>
  );
}
