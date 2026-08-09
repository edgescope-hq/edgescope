import { useId } from "react";

type EdgeApertureObjectProps = {
  className?: string;
};

const LEFT_PIECE =
  "M54 578 C42 568 38 552 41 532 L67 260 C69 245 75 231 85 219 L139 151 C148 139 160 134 172 139 L190 148 C200 153 206 163 207 175 L218 292 C219 302 216 311 210 319 L175 362 C170 369 168 378 170 387 L206 552 C210 570 197 586 178 586 L78 586 C69 586 61 583 54 578 Z";

const RIGHT_PIECE =
  "M239 580 C227 574 221 563 223 550 L245 390 C247 378 244 367 237 358 L217 331 C211 323 208 314 210 304 L235 88 C237 75 243 63 253 55 L278 34 C286 27 297 23 308 24 L351 29 C364 31 374 42 376 55 L400 544 C402 567 384 586 361 586 L260 586 C252 586 245 584 239 580 Z";

const LEFT_CHANNEL = "M187 158 L201 286 Q204 306 192 321 L159 362 Q151 374 154 391 L190 553";
const RIGHT_CHANNEL = "M249 84 L223 302 Q220 319 231 334 L251 361 Q260 374 257 393 L236 552";

export function EdgeApertureObject({ className = "" }: EdgeApertureObjectProps) {
  const gradientId = useId().replace(/:/g, "");
  const faceGradient = `${gradientId}-face`;
  const faceGlow = `${gradientId}-glow`;
  const edgeGradient = `${gradientId}-edge`;
  const reliefGradient = `${gradientId}-relief`;

  return (
    <div className={`edge-object ${className}`.trim()} aria-hidden="true">
      <div className="edge-object__influence" />
      <div className="edge-object__shadow" />

      <div className="edge-object__piece edge-object__piece--left">
        <svg viewBox="0 0 440 620" role="presentation">
          <defs>
            <linearGradient id={faceGradient} x1="0" y1="0" x2="1" y2="1">
              <stop className="edge-object__stop edge-object__stop--silver" offset="0" />
              <stop className="edge-object__stop edge-object__stop--graphite" offset="0.36" />
              <stop className="edge-object__stop edge-object__stop--ink" offset="0.72" />
              <stop className="edge-object__stop edge-object__stop--warm" offset="1" />
            </linearGradient>
            <radialGradient id={faceGlow} cx="0.22" cy="0.75" r="0.9">
              <stop className="edge-object__stop edge-object__stop--cyan" offset="0" />
              <stop className="edge-object__stop edge-object__stop--clear" offset="0.72" />
            </radialGradient>
            <linearGradient id={edgeGradient} x1="0" y1="0" x2="1" y2="0.8">
              <stop className="edge-object__stop edge-object__stop--edge-white" offset="0" />
              <stop className="edge-object__stop edge-object__stop--edge-violet" offset="0.5" />
              <stop className="edge-object__stop edge-object__stop--edge-cyan" offset="1" />
            </linearGradient>
            <linearGradient id={reliefGradient} x1="0.2" y1="0" x2="0.8" y2="1">
              <stop className="edge-object__stop edge-object__stop--relief-light" offset="0" />
              <stop className="edge-object__stop edge-object__stop--relief-mid" offset="0.52" />
              <stop className="edge-object__stop edge-object__stop--relief-dark" offset="1" />
            </linearGradient>
          </defs>
          <path className="edge-object__extrusion" d={LEFT_PIECE} transform="translate(7 8)" />
          <path className="edge-object__relief" d={LEFT_PIECE} fill={`url(#${reliefGradient})`} />
          <path className="edge-object__face" d={LEFT_PIECE} fill={`url(#${faceGradient})`} />
          <path className="edge-object__face-light" d={LEFT_PIECE} fill={`url(#${faceGlow})`} />
          <path className="edge-object__rim" d={LEFT_PIECE} />
          <path
            className="edge-object__channel edge-object__channel--left"
            d={LEFT_CHANNEL}
            stroke={`url(#${edgeGradient})`}
          />
          <path className="edge-object__channel-highlight" d={LEFT_CHANNEL} />
        </svg>
      </div>

      <div className="edge-object__piece edge-object__piece--right">
        <svg viewBox="0 0 440 620" role="presentation">
          <defs>
            <linearGradient id={`${faceGradient}-right`} x1="0" y1="0" x2="1" y2="1">
              <stop className="edge-object__stop edge-object__stop--silver" offset="0" />
              <stop className="edge-object__stop edge-object__stop--graphite" offset="0.3" />
              <stop className="edge-object__stop edge-object__stop--ink" offset="0.7" />
              <stop className="edge-object__stop edge-object__stop--warm" offset="1" />
            </linearGradient>
            <radialGradient id={`${faceGlow}-right`} cx="0.76" cy="0.2" r="0.84">
              <stop className="edge-object__stop edge-object__stop--neutral-light" offset="0" />
              <stop className="edge-object__stop edge-object__stop--clear" offset="0.7" />
            </radialGradient>
            <linearGradient id={`${edgeGradient}-right`} x1="0" y1="1" x2="1" y2="0">
              <stop className="edge-object__stop edge-object__stop--edge-cyan" offset="0" />
              <stop className="edge-object__stop edge-object__stop--edge-violet" offset="0.54" />
              <stop className="edge-object__stop edge-object__stop--edge-white" offset="1" />
            </linearGradient>
            <linearGradient id={`${reliefGradient}-right`} x1="0" y1="0" x2="1" y2="1">
              <stop className="edge-object__stop edge-object__stop--relief-light" offset="0" />
              <stop className="edge-object__stop edge-object__stop--relief-mid" offset="0.48" />
              <stop className="edge-object__stop edge-object__stop--relief-dark" offset="1" />
            </linearGradient>
          </defs>
          <path className="edge-object__extrusion" d={RIGHT_PIECE} transform="translate(7 8)" />
          <path
            className="edge-object__relief"
            d={RIGHT_PIECE}
            fill={`url(#${reliefGradient}-right)`}
          />
          <path
            className="edge-object__face"
            d={RIGHT_PIECE}
            fill={`url(#${faceGradient}-right)`}
          />
          <path
            className="edge-object__face-light"
            d={RIGHT_PIECE}
            fill={`url(#${faceGlow}-right)`}
          />
          <path className="edge-object__rim" d={RIGHT_PIECE} />
          <path
            className="edge-object__channel edge-object__channel--right"
            d={RIGHT_CHANNEL}
            stroke={`url(#${edgeGradient}-right)`}
          />
          <path className="edge-object__channel-highlight" d={RIGHT_CHANNEL} />
        </svg>
      </div>

      <div className="edge-object__channel-energy" />
      <div className="edge-object__gleam" />
    </div>
  );
}
