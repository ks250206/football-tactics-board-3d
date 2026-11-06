import * as T from 'three';
import { probabilityColor } from './analysis';
import { LANE_COLORS } from './geometry';
import { EMPTY_VISUALS, type XgVisuals } from './visuals';

function mesh(opacity: number) {
  return new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, side: T.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -8 }));
}
/** Persistent meshes/materials, replaced geometry disposed on every data update.
 * Final resources are disposed by the engine's scene traversal. */
export class XgOverlay3D {
  readonly root = new T.Group();
  private heat = mesh(.58);
  private ground = mesh(.26);
  private mouth = mesh(.62);
  private rays = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .55, depthWrite: false }));
  private current: XgVisuals = EMPTY_VISUALS;
  constructor() {
    this.heat.renderOrder = -8; this.ground.renderOrder = -6; this.mouth.renderOrder = 5; this.rays.renderOrder = 6;
    this.heat.visible=this.ground.visible=this.mouth.visible=this.rays.visible=false;
    this.root.add(this.heat, this.ground, this.mouth, this.rays);
    this.root.name = 'xg-analysis-overlays';
  }
  private replace(object: T.Mesh | T.LineSegments, vertices: number[], colors: number[]) {
    object.geometry.dispose();
    object.geometry = new T.BufferGeometry();
    object.geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    object.geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    object.visible = vertices.length > 0;
    if (vertices.length) object.geometry.computeBoundingSphere();
  }
  update(next: XgVisuals = EMPTY_VISUALS) {
    if (next.heatmap !== this.current.heatmap) {
      const v: number[] = [], c: number[] = [];
      for (const cell of next.heatmap) {
        const color = new T.Color(probabilityColor(cell.value));
        const x0 = cell.x - cell.width / 2, x1 = cell.x + cell.width / 2, z0 = cell.z - cell.depth / 2, z1 = cell.z + cell.depth / 2;
        v.push(x0,.024,z0, x1,.024,z0, x1,.024,z1, x0,.024,z0, x1,.024,z1, x0,.024,z1);
        for (let i=0;i<6;i++) c.push(color.r,color.g,color.b);
      }
      this.replace(this.heat,v,c);
    }
    if (next.geometry !== this.current.geometry) {
      const v:number[]=[],c:number[]=[], mv:number[]=[],mc:number[]=[], rv:number[]=[],rc:number[]=[];
      const g=next.geometry;
      if(g) {
        for(const lane of g.lanes) {
          const color=new T.Color(LANE_COLORS[lane.kind]);
          v.push(g.shot.x,.029,g.shot.z,g.goalX,.029,lane.z0,g.goalX,.029,lane.z1);
          for(let i=0;i<3;i++)c.push(color.r,color.g,color.b);
        }
        for(const cell of g.cells) {
          const color=new T.Color(LANE_COLORS[cell.kind]);
          const y0=cell.y-cell.height/2,y1=cell.y+cell.height/2,z0=cell.z-cell.width/2,z1=cell.z+cell.width/2;
          mv.push(g.goalX,y0,z0,g.goalX,y1,z0,g.goalX,y1,z1,g.goalX,y0,z0,g.goalX,y1,z1,g.goalX,y0,z1);
          for(let i=0;i<6;i++)mc.push(color.r,color.g,color.b);
          // A sparse selection keeps the first-person view legible.
          if(Math.abs(cell.y-1.0675)<.01 && Math.round((cell.z+3.66)/cell.width-.5)%3===0) {
            rv.push(g.shot.x,g.shot.y,g.shot.z,g.goalX,cell.y,cell.z);
            rc.push(color.r,color.g,color.b,color.r,color.g,color.b);
          }
        }
      }
      this.replace(this.ground,v,c);this.replace(this.mouth,mv,mc);this.replace(this.rays,rv,rc);
    }
    this.current=next;
  }
}
