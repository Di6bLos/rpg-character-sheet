// @3d-dice/dice-box-threejs ships no types; this covers the parts the dice tray uses.
declare module '@3d-dice/dice-box-threejs' {
  interface DiceMesh {
    position: { clone(): { project(camera: unknown): { x: number; y: number } } }
    material: DiceMaterial | DiceMaterial[]
  }
  interface DiceMaterial {
    transparent: boolean
    opacity: number
  }
  export default class DiceBox {
    constructor(selector: string, config?: Record<string, unknown>)
    diceList: DiceMesh[]
    camera: unknown
    scene: unknown
    renderer: { render(scene: unknown, camera: unknown): void }
    initialize(): Promise<void>
    /** "2d20+1d6@17,5,3" throws dice that land on the listed values, in order. */
    roll(notation: string): Promise<unknown>
    /** Throws more dice onto the table, keeping the ones already there. */
    add(notation: string): Promise<unknown>
    clearDice(): void
    updateConfig(config: Record<string, unknown>): Promise<void>
    setDimensions(dimensions?: { x: number; y: number }): void
  }
}
