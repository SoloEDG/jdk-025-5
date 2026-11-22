// Tarjan 强连通分量：用于在光束变量有向图上识别回环（闭环叠加）。
export interface SccResult {
  // 每个变量所属分量 id
  component: Int32Array;
  // 分量包含的变量
  groups: number[][];
}

export function tarjanSCC(n: number, edges: number[][]): SccResult {
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack: number[] = [];
  const component = new Int32Array(n).fill(-1);
  const groups: number[][] = [];
  let timer = 0;
  let compCount = 0;

  const strongConnect = (v: number) => {
    // 显式栈，避免大图递归爆栈
    interface Frame {
      v: number;
      next: number;
    }
    const callStack: Frame[] = [{ v, next: 0 }];
    index[v] = low[v] = timer++;
    stack.push(v);
    onStack[v] = 1;

    while (callStack.length) {
      const frame = callStack[callStack.length - 1];
      const cur = frame.v;
      if (frame.next < edges[cur].length) {
        const w = edges[cur][frame.next++];
        if (index[w] === -1) {
          index[w] = low[w] = timer++;
          stack.push(w);
          onStack[w] = 1;
          callStack.push({ v: w, next: 0 });
        } else if (onStack[w]) {
          low[cur] = Math.min(low[cur], index[w]);
        }
      } else {
        if (low[cur] === index[cur]) {
          const group: number[] = [];
          let w: number;
          do {
            w = stack.pop()!;
            onStack[w] = 0;
            component[w] = compCount;
            group.push(w);
          } while (w !== cur);
          groups.push(group);
          compCount++;
        }
        callStack.pop();
        if (callStack.length) {
          const parent = callStack[callStack.length - 1].v;
          low[parent] = Math.min(low[parent], low[cur]);
        }
      }
    }
  };

  for (let v = 0; v < n; v++) if (index[v] === -1) strongConnect(v);
  return { component, groups };
}
