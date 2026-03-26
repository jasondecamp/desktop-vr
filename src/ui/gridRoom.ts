import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { ScreenConfig } from '../projection/types';

export interface GridRoomConfig {
  /** How far back the grid extends from z=0. Default: 1.2 */
  depth?: number;
  /** Spacing between grid lines in meters (grid style only). Default: 0.08 */
  gridSpacing?: number;
  /** Grid line color at z=0 (grid style only). Default: 0x334466 */
  gridColor?: number;
  /** Background color to fade into (grid style). Default: 0x000000 */
  bgColor?: number;
  /** Line width in pixels (grid style). Default: 1.5 */
  lineWidth?: number;
  /** Show a grid/surface on the back wall. Default: false */
  showBackWall?: boolean;
  /** Wall rendering style. Default: 'grid' */
  wallStyle?: 'grid' | 'solid';
  /** Wall color for solid style. Default: 0x1a1a2e */
  wallColor?: number;
}

export class GridRoom {
  private group: THREE.Group;
  private screen: ScreenConfig;
  private depth: number;
  private gridSpacing: number;
  private gridColor: THREE.Color;
  private bgColor: THREE.Color;
  private showBackWall: boolean;
  private wallStyle: 'grid' | 'solid';
  private wallColor: THREE.Color;
  private lineWidth: number;

  constructor(screen: ScreenConfig, config: GridRoomConfig = {}) {
    this.group = new THREE.Group();
    this.screen = screen;
    this.depth = config.depth ?? 1.2;
    this.gridSpacing = config.gridSpacing ?? 0.08;
    this.gridColor = new THREE.Color(config.gridColor ?? 0x334466);
    this.bgColor = new THREE.Color(config.bgColor ?? 0x000000);
    this.showBackWall = config.showBackWall ?? false;
    this.wallStyle = config.wallStyle ?? 'grid';
    this.wallColor = new THREE.Color(config.wallColor ?? 0x1a1a2e);
    this.lineWidth = config.lineWidth ?? 1.5;
    this.rebuild();
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  updateScreen(screen: ScreenConfig): void {
    this.screen = screen;
    this.rebuild();
  }

  getDepth(): number {
    return this.depth;
  }

  rebuild(): void {
    // Dispose old children
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if ('geometry' in child && 'material' in child) {
        (child as THREE.Mesh).geometry.dispose();
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else (mat as THREE.Material).dispose();
      }
    }

    if (this.wallStyle === 'solid') {
      this.buildSolidWalls();
    } else {
      this.buildGridWalls();
    }
  }

  // --- Solid walls ---

  private buildSolidWalls(): void {
    const { halfW, halfH } = this.computeVisibleRect();
    const d = this.depth;

    const wallMat = new THREE.MeshStandardMaterial({
      color: this.wallColor,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.FrontSide,
    });

    // Floor (faces up)
    const floorGeo = new THREE.PlaneGeometry(halfW * 2, d);
    const floor = new THREE.Mesh(floorGeo, wallMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -halfH, -d / 2);
    this.group.add(floor);

    // Ceiling (faces down)
    const ceilGeo = new THREE.PlaneGeometry(halfW * 2, d);
    const ceil = new THREE.Mesh(ceilGeo, wallMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, halfH, -d / 2);
    this.group.add(ceil);

    // Left wall (faces right)
    const leftGeo = new THREE.PlaneGeometry(d, halfH * 2);
    const left = new THREE.Mesh(leftGeo, wallMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-halfW, 0, -d / 2);
    this.group.add(left);

    // Right wall (faces left)
    const rightGeo = new THREE.PlaneGeometry(d, halfH * 2);
    const right = new THREE.Mesh(rightGeo, wallMat);
    right.rotation.y = -Math.PI / 2;
    right.position.set(halfW, 0, -d / 2);
    this.group.add(right);

    // Back wall
    if (this.showBackWall) {
      const backGeo = new THREE.PlaneGeometry(halfW * 2, halfH * 2);
      const back = new THREE.Mesh(backGeo, wallMat);
      back.position.set(0, 0, -d);
      this.group.add(back);
    }

    // Add subtle edge lines at the seams for definition
    const edgeMat = new THREE.LineBasicMaterial({
      color: this.wallColor.clone().lerp(new THREE.Color(0xffffff), 0.08),
    });

    // Front edges (at z=0)
    const frontEdge = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfW, -halfH, 0),
      new THREE.Vector3(-halfW, halfH, 0),
      new THREE.Vector3(halfW, halfH, 0),
      new THREE.Vector3(halfW, -halfH, 0),
      new THREE.Vector3(-halfW, -halfH, 0),
    ]);
    this.group.add(new THREE.Line(frontEdge, edgeMat));

    // Corner depth lines
    for (const [cx, cy] of [[-halfW, -halfH], [halfW, -halfH], [-halfW, halfH], [halfW, halfH]] as [number, number][]) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cx, cy, 0),
        new THREE.Vector3(cx, cy, -d),
      ]);
      this.group.add(new THREE.Line(geo, edgeMat));
    }

    // Back edges
    if (this.showBackWall) {
      const backEdge = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-halfW, -halfH, -d),
        new THREE.Vector3(-halfW, halfH, -d),
        new THREE.Vector3(halfW, halfH, -d),
        new THREE.Vector3(halfW, -halfH, -d),
        new THREE.Vector3(-halfW, -halfH, -d),
      ]);
      this.group.add(new THREE.Line(backEdge, edgeMat));
    }
  }

  // --- Grid walls (original) ---

  private buildGridWalls(): void {
    const { halfW, halfH } = this.computeVisibleRect();

    // Corner lines from z=0 into the distance
    for (const [cx, cy] of [[-halfW, -halfH], [halfW, -halfH], [-halfW, halfH], [halfW, halfH]] as [number, number][]) {
      this.addFadingLine(
        new THREE.Vector3(cx, cy, 0),
        new THREE.Vector3(cx, cy, -this.depth),
      );
    }

    // Cross-section rings at depth intervals
    const depthSteps = Math.ceil(this.depth / this.gridSpacing);
    for (let i = 0; i <= depthSteps; i++) {
      const z = -(i / depthSteps) * this.depth;
      for (const y of [-halfH, halfH]) {
        this.addFadingLine(
          new THREE.Vector3(-halfW, y, z),
          new THREE.Vector3(halfW, y, z),
        );
      }
      for (const x of [-halfW, halfW]) {
        this.addFadingLine(
          new THREE.Vector3(x, -halfH, z),
          new THREE.Vector3(x, halfH, z),
        );
      }
    }

    // Longitudinal lines on all four walls
    const countW = Math.max(2, Math.ceil((halfW * 2) / this.gridSpacing));
    const countH = Math.max(2, Math.ceil((halfH * 2) / this.gridSpacing));

    for (let i = 0; i <= countW; i++) {
      const x = -halfW + (i / countW) * halfW * 2;
      this.addFadingLine(
        new THREE.Vector3(x, -halfH, 0),
        new THREE.Vector3(x, -halfH, -this.depth),
      );
      this.addFadingLine(
        new THREE.Vector3(x, halfH, 0),
        new THREE.Vector3(x, halfH, -this.depth),
      );
    }

    for (let i = 0; i <= countH; i++) {
      const y = -halfH + (i / countH) * halfH * 2;
      this.addFadingLine(
        new THREE.Vector3(-halfW, y, 0),
        new THREE.Vector3(-halfW, y, -this.depth),
      );
      this.addFadingLine(
        new THREE.Vector3(halfW, y, 0),
        new THREE.Vector3(halfW, y, -this.depth),
      );
    }

    // Back wall grid
    if (this.showBackWall) {
      const z = -this.depth;
      const backColor = this.gridColor.clone().lerp(this.bgColor.clone(), 0.5);

      for (let i = 0; i <= countH; i++) {
        const y = -halfH + (i / countH) * halfH * 2;
        this.addBackWallLine(
          new THREE.Vector3(-halfW, y, z),
          new THREE.Vector3(halfW, y, z),
          backColor,
        );
      }

      for (let i = 0; i <= countW; i++) {
        const x = -halfW + (i / countW) * halfW * 2;
        this.addBackWallLine(
          new THREE.Vector3(x, -halfH, z),
          new THREE.Vector3(x, halfH, z),
          backColor,
        );
      }
    }
  }

  private computeVisibleRect(): { halfW: number; halfH: number } {
    const screenAR = this.screen.widthMeters / this.screen.heightMeters;
    const viewportAR = window.innerWidth / window.innerHeight;

    let halfW = this.screen.widthMeters / 2;
    let halfH = this.screen.heightMeters / 2;

    if (viewportAR > screenAR) {
      halfW *= viewportAR / screenAR;
    } else if (viewportAR < screenAR) {
      halfH *= screenAR / viewportAR;
    }

    return { halfW, halfH };
  }

  private addBackWallLine(start: THREE.Vector3, end: THREE.Vector3, color: THREE.Color): void {
    const geo = new LineGeometry();
    geo.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);
    const mat = new LineMaterial({
      color: color.getHex(),
      linewidth: this.lineWidth,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
    });
    this.group.add(new Line2(geo, mat));
  }

  private addFadingLine(start: THREE.Vector3, end: THREE.Vector3): void {
    const geo = new LineGeometry();
    geo.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);

    const startT = Math.abs(start.z) / this.depth;
    const endT = Math.abs(end.z) / this.depth;
    const startColor = this.gridColor.clone().lerp(this.bgColor.clone(), startT);
    const endColor = this.gridColor.clone().lerp(this.bgColor.clone(), endT);
    geo.setColors([
      startColor.r, startColor.g, startColor.b,
      endColor.r, endColor.g, endColor.b,
    ]);

    const mat = new LineMaterial({
      vertexColors: true,
      linewidth: this.lineWidth,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
    });

    this.group.add(new Line2(geo, mat));
  }

  /** Update LineMaterial resolution after viewport resize */
  updateResolution(): void {
    const res = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.group.traverse((c) => {
      if (c instanceof Line2) {
        (c.material as LineMaterial).resolution = res;
      }
    });
  }
}
