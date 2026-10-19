export interface Hotspot {
  id: string;
  name: string;
  description: string;
  position: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  value?: number;
  isCustom?: boolean;
}

export interface Organ {
  id: string;
  name: string;
  description: string;
  function: string;
  image: string;
  model: string;
  hotspots?: Hotspot[];
  clickableMeshes?: string[];
}

export interface OrganScreenshot {
  id: string;
  organId: string;
  organName: string;
  imageDataUrl: string;
  capturedAt: string;
  focusedPart?: string;
  camera: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  };
}
