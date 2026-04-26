declare module "react-simple-maps" {
  import type { ReactNode } from "react";

  export type GeographyProps = {
    geography: unknown;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: Record<string, React.CSSProperties>;
  };

  export function Geography(props: GeographyProps): JSX.Element;

  export type GeographiesRenderArgs = {
    geographies: Array<{ rsmKey: string } & Record<string, unknown>>;
  };

  export function Geographies(props: {
    geography: string | object;
    children: (arg: GeographiesRenderArgs) => ReactNode;
  }): JSX.Element;

  export function Marker(props: {
    coordinates: [number, number];
    children?: ReactNode;
  }): JSX.Element;

  export function Line(props: {
    from: [number, number];
    to: [number, number];
    stroke?: string;
    strokeWidth?: number;
    strokeOpacity?: number;
    strokeLinecap?: React.SVGAttributes<SVGLineElement>["strokeLinecap"];
  }): JSX.Element;

  export function ComposableMap(props: {
    projection?: string;
    projectionConfig?: Record<string, number | [number, number]>;
    width?: number;
    height?: number;
    className?: string;
    style?: React.CSSProperties;
    children?: ReactNode;
  }): JSX.Element;

  export type ZoomableGroupProps = {
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    translateExtent?: [[number, number], [number, number]];
    filterZoomEvent?: (event: unknown) => boolean;
    onMoveStart?: (event: unknown) => void;
    onMove?: (event: unknown) => void;
    onMoveEnd?: (event: unknown) => void;
    className?: string;
    children?: ReactNode;
  };

  export function ZoomableGroup(props: ZoomableGroupProps): JSX.Element;
}
