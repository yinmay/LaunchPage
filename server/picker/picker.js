// launchPage 框选脚本：由预览代理注入到 Agent 生成的站点里，只在被 launchPage 以 iframe 嵌入时生效。
// 交互：悬停高亮 → 单击选中元素；或按住拖出一个框，选中能完整包住这个框的最深层元素。
// Shift 可连续多选，Esc 退出框选。选中结果通过 postMessage 交给宿主页。
(() => {
  if (window.parent === window || window.__launchpagePicker) return;
  window.__launchpagePicker = true;

  const ATTR = "data-launchpage";
  const ACCENT = "#7c5cff";
  let active = false;
  let hoverEl = null;
  let drag = null; // { x, y, moved }
  const marks = []; // { el, box }

  const send = (msg) => window.parent.postMessage({ source: "launchpage-preview", ...msg }, "*");

  const layer = document.createElement("div");
  layer.setAttribute(ATTR, "");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const hoverBox = box("2px solid " + ACCENT, "rgba(124,92,255,.12)");
  const band = box("1.5px dashed " + ACCENT, "rgba(124,92,255,.08)");
  const label = document.createElement("div");
  label.style.cssText =
    "position:absolute;padding:2px 6px;border-radius:4px;background:" + ACCENT +
    ";color:#fff;font:600 11px/1.4 ui-monospace,monospace;white-space:nowrap;display:none;";
  layer.append(hoverBox, band, label);
  const style = document.createElement("style");
  style.textContent = "html.launchpage-picking, html.launchpage-picking * { cursor: crosshair !important; }";

  function box(border, bg) {
    const d = document.createElement("div");
    d.style.cssText = `position:absolute;display:none;border:${border};background:${bg};border-radius:3px;`;
    return d;
  }
  function place(d, r) {
    d.style.display = "block";
    d.style.left = `${r.left}px`;
    d.style.top = `${r.top}px`;
    d.style.width = `${r.width}px`;
    d.style.height = `${r.height}px`;
  }
  const isOurs = (el) => !el || el.closest?.(`[${ATTR}]`);

  function mount() {
    if (!layer.isConnected) document.documentElement.append(layer, style);
  }

  function setActive(on) {
    active = on;
    mount();
    document.documentElement.classList.toggle("launchpage-picking", on);
    drag = null; // 开关切换时总是丢掉进行中的拖框
    if (!on) {
      hoverEl = null;
      hoverBox.style.display = band.style.display = label.style.display = "none";
    }
  }

  // ---- 描述被选中的元素 ----
  function cssPath(el) {
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
      return `#${CSS.escape(el.id)}`;
    }
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body && parts.length < 6) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) {
        parts.unshift(`${part}#${CSS.escape(cur.id)}`);
        break;
      }
      const cls = [...cur.classList].filter((c) => c.length < 40).slice(0, 2);
      if (cls.length) part += `.${cls.map((c) => CSS.escape(c)).join(".")}`;
      const parent = cur.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === cur.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(" > ") || el.tagName.toLowerCase();
  }

  function describe(el) {
    const r = el.getBoundingClientRect();
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const html = el.outerHTML;
    return {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.getAttribute("alt") || el.getAttribute("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200),
      html: html.length > 1500 ? `${html.slice(0, 1500)}…` : html,
      rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      scrollProgress: Math.min(1, Math.max(0, window.scrollY / max)),
    };
  }

  function select(el, additive) {
    if (!additive) clearMarks();
    const b = box(`2px solid ${ACCENT}`, "rgba(124,92,255,.18)");
    layer.append(b);
    marks.push({ el, box: b });
    send({ type: "picked", element: describe(el) });
  }

  function clearMarks() {
    for (const m of marks.splice(0)) m.box.remove();
  }

  // 站点是滚动驱动的动画，元素位置随时在变；每帧跟随
  function tick() {
    for (const m of marks) {
      if (m.el.isConnected) place(m.box, m.el.getBoundingClientRect());
      else m.box.style.display = "none";
    }
    if (active && hoverEl && !drag?.moved) {
      const r = hoverEl.getBoundingClientRect();
      place(hoverBox, r);
      label.textContent = hoverEl.tagName.toLowerCase();
      label.style.display = "block";
      label.style.left = `${r.left}px`;
      label.style.top = `${Math.max(0, r.top - 20)}px`;
    }
    requestAnimationFrame(tick);
  }

  // 拖框：取能完整包住框的最深层元素
  function elementForBand(x1, y1, x2, y2) {
    const L = Math.min(x1, x2), T = Math.min(y1, y2), R = Math.max(x1, x2), B = Math.max(y1, y2);
    const els = document.elementsFromPoint((L + R) / 2, (T + B) / 2).filter((e) => !isOurs(e));
    const tol = 4;
    const hit = els.find((e) => {
      const r = e.getBoundingClientRect();
      return r.left - tol <= L && r.top - tol <= T && r.right + tol >= R && r.bottom + tol >= B;
    });
    return hit || els[0] || null;
  }

  // ---- 事件（捕获阶段，拦住站点自身的点击） ----
  const block = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // 拖框途中松手的位置可能不在本文档里（拖出 iframe、切走窗口），mouseup 就收不到。
  // 留下的 drag 起点会让下一次 mouseup 框出一个巨大的区域，误选整块容器 —— 所以要主动作废。
  const cancelDrag = () => {
    drag = null;
    band.style.display = "none";
  };
  window.addEventListener("blur", cancelDrag);
  document.documentElement.addEventListener("mouseleave", cancelDrag);

  document.addEventListener("mousemove", (e) => {
    if (!active) return;
    if (drag && (e.buttons & 1) === 0) cancelDrag(); // 左键早已松开
    if (drag) {
      const moved = Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6;
      if (moved) {
        drag.moved = true;
        hoverBox.style.display = label.style.display = "none";
        place(band, {
          left: Math.min(drag.x, e.clientX),
          top: Math.min(drag.y, e.clientY),
          width: Math.abs(e.clientX - drag.x),
          height: Math.abs(e.clientY - drag.y),
        });
      }
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    hoverEl = isOurs(el) ? null : el;
  }, true);

  document.addEventListener("mousedown", (e) => {
    if (!active || e.button !== 0) return;
    block(e);
    drag = { x: e.clientX, y: e.clientY, moved: false };
  }, true);

  document.addEventListener("mouseup", (e) => {
    if (!active || !drag || e.button !== 0) return;
    block(e);
    const el = drag.moved
      ? elementForBand(drag.x, drag.y, e.clientX, e.clientY)
      : document.elementFromPoint(e.clientX, e.clientY); // 以松手位置为准，不依赖可能过时的 hoverEl
    cancelDrag();
    if (el && !isOurs(el) && el !== document.documentElement && el !== document.body) {
      select(el, e.shiftKey);
    }
  }, true);

  document.addEventListener("click", (e) => active && block(e), true);

  document.addEventListener("keydown", (e) => {
    if (active && e.key === "Escape") {
      setActive(false);
      send({ type: "pick-mode-off" });
    }
  }, true);

  window.addEventListener("message", (e) => {
    if (e.source !== window.parent) return;
    const d = e.data;
    if (!d || d.source !== "launchpage-host") return;
    if (d.type === "pick-mode") setActive(!!d.on);
    if (d.type === "clear") clearMarks();
  });

  const boot = () => {
    mount();
    requestAnimationFrame(tick);
    send({ type: "ready" });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
