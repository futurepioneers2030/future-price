// مساعدات DOM صغيرة — بلا مكتبات خارجية.

/** el('div', {class:'x', onclick:fn}, 'نص', childNode) */
export function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) {
    if (c === null || c === undefined || c === false) continue;
    n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return n;
}

/** مبلغ + كلمة «ريال» بحجم أصغر */
export function money(sum, cls, unitCls) {
  return el('div', { class: cls || 'rw-money' }, String(sum), ' ', el('small', { class: unitCls || null }, 'ريال'));
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
