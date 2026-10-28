import type { MathfieldElement } from 'mathlive';
import { MathNodeNavigator } from '../math/MathNodeNavigator';
import { MathStructureAdapter } from '../math/MathStructureAdapter';

export class CursorNavigation {
  constructor(private readonly field: MathfieldElement) {}
  move(direction: -1 | 1, exit: boolean): void {
    const navigator = new MathNodeNavigator(MathStructureAdapter.from(this.field));
    this.field.position = exit ? navigator.exit(this.field.position, direction) : navigator.move(this.field.position, direction);
  }
}
