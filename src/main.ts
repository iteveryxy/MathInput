import './styles.css';
import { EditorWindow } from './components/EditorWindow';

const fonts = document.createElement('link'); fonts.rel = 'stylesheet'; fonts.href = '/mathlive/mathlive-fonts.css';
const mathStyles = document.createElement('link'); mathStyles.rel = 'stylesheet'; mathStyles.href = '/mathlive/mathlive-static.css';
document.head.append(fonts, mathStyles);
const window = new EditorWindow(document.querySelector<HTMLDivElement>('#app')!);
if (import.meta.env.DEV) Object.assign(globalThis, { mathInput: window });
