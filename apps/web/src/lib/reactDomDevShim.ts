export function flushSync(callback: () => void): void {
  callback();
}

const ReactDomDevShim = {
  createPortal(element: unknown): unknown {
    return element;
  }
};

export default ReactDomDevShim;
