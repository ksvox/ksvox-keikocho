import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// 歌詞シートの論理的な横幅。どのiPadでも同じ位置で折り返すよう、
// この幅で組んだものを画面幅に合わせて拡大縮小する。
export const SHEET_W = 720;

export const PEN_COLORS = ['#C2485A', '#2F6FD0', '#2E8B57', '#1C2733'];
// 歌詞の標準の文字サイズ・行間(新しく読み込む曲に保存され、その曲の中では固定)
export const DEFAULT_LAYOUT = { fontSize: 19, lineHeight: 2.1 };
export const ZOOM_LEVELS = [0.8, 1, 1.25, 1.5];
// iPadのSafariで描画が消えないよう、キャンバスの画素数に上限を設ける
const MAX_CANVAS_PIXELS = 12000000;
export const HIGHLIGHT_COLOR = '#F2C230';

// ---- 線データの圧縮(座標を10倍の整数にして文字列化) ----
export function encodePoints(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i += 1) out.push(Math.round(pts[i] * 10));
  return out.join(' ');
}

const decodeCache = new Map();
function decodePoints(str) {
  if (!str) return [];
  const hit = decodeCache.get(str);
  if (hit) return hit;
  const arr = str.split(' ').map((n) => Number(n) / 10);
  if (decodeCache.size > 4000) decodeCache.clear();
  decodeCache.set(str, arr);
  return arr;
}

function drawPath(ctx, pts, color, width, alpha, highlight) {
  if (!pts || pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha * (highlight ? 0.35 : 1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = highlight ? 'butt' : 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 2) {
    ctx.beginPath();
    ctx.arc(pts[0], pts[1], width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = (pts[i] + pts[i + 2]) / 2;
    const my = (pts[i + 1] + pts[i + 3]) / 2;
    ctx.quadraticCurveTo(pts[i], pts[i + 1], mx, my);
  }
  ctx.lineTo(pts[pts.length - 2], pts[pts.length - 1]);
  ctx.stroke();
  ctx.restore();
}

function drawStroke(ctx, s, alpha) {
  drawPath(ctx, decodePoints(s.p), s.c, s.w, alpha, !!s.h);
}

function hitsStroke(s, x, y, r) {
  const pts = decodePoints(s.p);
  const rr = (r + s.w / 2) * (r + s.w / 2);
  for (let i = 0; i < pts.length; i += 2) {
    const dx = pts[i] - x;
    const dy = pts[i + 1] - y;
    if (dx * dx + dy * dy <= rr) return true;
  }
  return false;
}

/**
 * props:
 *  text         歌詞(なしなら白紙のメモ帳)
 *  pastLayers   過去の書き込み [{key, strokes}]
 *  pastAlpha    過去の書き込みの濃さ
 *  strokes      今回の書き込み(編集できる層)
 *  onChange     今回の書き込みが変わった時
 *  tool         {mode:'pen'|'eraser', color, width, highlight}
 *  fingerMode   指でも書くか
 *  minHeight    最低の高さ(論理px)
 *  extraSpace   歌詞の下に取る余白(論理px)
 *  emptyText    何もない時の案内
 *  readOnly
 */
export default function InkSheet({
  text = '',
  pastLayers = [],
  pastAlpha = 0.4,
  strokes = [],
  onChange,
  tool,
  fingerMode = false,
  minHeight = 600,
  extraSpace = 360,
  emptyText = '',
  readOnly = false,
  textStyle,
  zoom = 1,
}) {
  const outerRef = useRef(null);
  const textRef = useRef(null);
  const baseRef = useRef(null);
  const liveRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(minHeight);
  const drawing = useRef(null);
  const erasing = useRef(false);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  // 画面幅に合わせた拡大率
  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return undefined;
    const update = () => setScale(((el.clientWidth || SHEET_W) / SHEET_W) * zoom);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom]);

  // 歌詞の長さに合わせた高さ
  useLayoutEffect(() => {
    const t = textRef.current;
    const th = t ? t.offsetHeight : 0;
    setHeight(Math.max(minHeight, text ? th + extraSpace : minHeight));
  }, [text, minHeight, extraSpace, scale, textStyle && textStyle.fontSize, textStyle && textStyle.lineHeight]);

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  const prepCanvas = useCallback(
    (cv) => {
      if (!cv) return null;
      const r = Math.min(scale * dpr, Math.sqrt(MAX_CANVAS_PIXELS / (SHEET_W * height)));
      const w = Math.round(SHEET_W * r);
      const h = Math.round(height * r);
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.setTransform(r, 0, 0, r, 0, 0);
      return ctx;
    },
    [scale, height, dpr]
  );

  // 確定済みの書き込みを描き直す
  useEffect(() => {
    const ctx = prepCanvas(baseRef.current);
    if (!ctx) return;
    ctx.clearRect(0, 0, SHEET_W, height);
    if (pastAlpha > 0) {
      pastLayers.forEach((layer) => (layer.strokes || []).forEach((s) => drawStroke(ctx, s, pastAlpha)));
    }
    (strokes || []).forEach((s) => drawStroke(ctx, s, 1));
  }, [pastLayers, pastAlpha, strokes, prepCanvas, height]);

  useEffect(() => {
    prepCanvas(liveRef.current);
  }, [prepCanvas]);

  const toLocal = (e) => {
    const rect = liveRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * SHEET_W) / rect.width,
      y: ((e.clientY - rect.top) * height) / rect.height,
    };
  };

  const drawLive = () => {
    const ctx = prepCanvas(liveRef.current);
    if (!ctx) return;
    ctx.clearRect(0, 0, SHEET_W, height);
    const d = drawing.current;
    if (d) drawPath(ctx, d.pts, d.color, d.width, 1, d.highlight);
  };

  const eraseAt = (p) => {
    const list = strokesRef.current || [];
    const next = list.filter((s) => !hitsStroke(s, p.x, p.y, 10));
    if (next.length !== list.length) {
      strokesRef.current = next;
      onChange && onChange(next);
    }
  };

  const canDraw = (e) => !readOnly && tool && (e.pointerType === 'pen' || e.pointerType === 'mouse' || fingerMode);

  const onPointerDown = (e) => {
    if (!canDraw(e)) return;
    e.preventDefault();
    try {
      liveRef.current.setPointerCapture(e.pointerId);
    } catch (err) {
      /* noop */
    }
    const p = toLocal(e);
    if (tool.mode === 'eraser') {
      erasing.current = true;
      eraseAt(p);
      return;
    }
    drawing.current = {
      id: e.pointerId,
      pts: [p.x, p.y],
      color: tool.highlight ? HIGHLIGHT_COLOR : tool.color,
      width: tool.highlight ? 18 : tool.width,
      highlight: !!tool.highlight,
    };
    drawLive();
  };

  const onPointerMove = (e) => {
    if (erasing.current) {
      e.preventDefault();
      eraseAt(toLocal(e));
      return;
    }
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    const evs = e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    (evs.length ? evs : [e.nativeEvent]).forEach((ev) => {
      const p = toLocal(ev);
      const lx = d.pts[d.pts.length - 2];
      const ly = d.pts[d.pts.length - 1];
      if ((p.x - lx) ** 2 + (p.y - ly) ** 2 > 0.6) d.pts.push(p.x, p.y);
    });
    drawLive();
  };

  const finish = (e) => {
    if (erasing.current) {
      erasing.current = false;
      return;
    }
    const d = drawing.current;
    if (!d || (e && d.id !== e.pointerId)) return;
    drawing.current = null;
    const stroke = { c: d.color, w: d.width, p: encodePoints(d.pts) };
    if (d.highlight) stroke.h = 1;
    const next = [...(strokesRef.current || []), stroke];
    strokesRef.current = next;
    onChange && onChange(next);
    drawLive();
  };

  // Apple Pencilで書く時だけ画面スクロールを止める(指のスクロールは生かす)
  useEffect(() => {
    const cv = liveRef.current;
    if (!cv) return undefined;
    const block = (ev) => {
      if (readOnly) return;
      const ts = ev.touches ? Array.from(ev.touches) : [];
      if (ts.some((t) => t.touchType === 'stylus')) ev.preventDefault();
    };
    cv.addEventListener('touchstart', block, { passive: false });
    cv.addEventListener('touchmove', block, { passive: false });
    return () => {
      cv.removeEventListener('touchstart', block);
      cv.removeEventListener('touchmove', block);
    };
  }, [readOnly]);

  const cssW = SHEET_W;
  return (
    <div ref={outerRef} className="sheet-wrap">
      <div
        className="sheet-outer"
        style={{ width: SHEET_W * scale, height: height * scale, margin: zoom < 1 ? '0 auto' : 0 }}
      >
        <div className="sheet-inner" style={{ width: cssW, height, transform: `scale(${scale})` }}>
          {text ? (
            <div ref={textRef} className="sheet-text" style={textStyle}>
              {text}
            </div>
          ) : (
            emptyText && <div className="sheet-empty">{emptyText}</div>
          )}
          <canvas ref={baseRef} className="sheet-canvas" style={{ width: cssW, height, pointerEvents: 'none' }} />
          <canvas
            ref={liveRef}
            className={`sheet-canvas ${fingerMode && !readOnly ? 'finger' : 'pen-only'}`}
            style={{ width: cssW, height }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onPointerLeave={(e) => {
              if (erasing.current) erasing.current = false;
              else if (drawing.current && e.pointerType === 'mouse') finish(e);
            }}
          />
        </div>
      </div>
    </div>
  );
}
