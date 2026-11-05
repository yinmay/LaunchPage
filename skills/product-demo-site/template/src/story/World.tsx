// The whole stage, rendered once at world scale. The camera moves and scales it.
// The protagonists are the product's REAL screens (captured with `pnpm capture` into
// shots.json): place them as Screens, then point at what matters with Highlight / Callout.
// Positions of real UI elements come from shots.json `focus` rects — measured, not guessed.

import { Arrow, Board, Callout, CheckRow, Highlight, Screen } from "../engine/parts.tsx";
import { BOARDS, TIMELINE, WORLD } from "./script.ts";

const { beat } = TIMELINE;
const { before: b1, during: b2 } = BOARDS;
// Once shots.json is filled: import SHOTS from "./shots.json" and asset from "../engine/asset.ts",
// then <Screen src={asset(SHOTS.home.src)} … />.

export function World() {
  return (
    <div className="absolute top-0 left-0" style={{ width: WORLD.x + WORLD.w, height: WORLD.h }}>
      <Board rect={b1} at={beat(0, 0)} index="01" title="TODO(brief): 画板标题">
        <Screen at={beat(0, 0.1)} x={40} y={40} w={760} h={600} label="TODO(brief): 产品页面 URL" />
        <Highlight at={beat(0, 0.4)} x={80} y={140} w={400} h={120} />
        <Callout at={beat(0, 0.5)} x={840} y={160}>TODO(brief): 这个界面在做什么</Callout>
      </Board>
      <Board rect={b2} at={beat(1, 0.05)} index="02" title="TODO(brief): 画板标题">
        <CheckRow at={beat(1, 0.3)} doneAt={beat(1, 0.6)} x={60} y={80} code="01">TODO(brief): 一个结果</CheckRow>
        <CheckRow at={beat(1, 0.35)} doneAt={beat(1, 0.7)} x={60} y={140} code="02">TODO(brief): 一个结果</CheckRow>
      </Board>
      <Arrow at={beat(1, 0.02)} from={[b1.x + b1.w + 10, 350]} to={[b2.x - 10, 350]} />
    </div>
  );
}
