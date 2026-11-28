import gpt from "./model-marks/gpt.svg";
import claude from "./model-marks/claude.svg";
import deepseek from "./model-marks/deepseek.svg";
import gemini from "./model-marks/gemini.svg";

const marks: Record<string, {src: string}> = {gpt, claude, deepseek, gemini};

export function ModelMark({id, size = 24}: {id: string; size?: number}) {
  const icon = marks[id];
  if (!icon) return null;
  return <span aria-hidden="true" style={{display:"inline-block", width:size, height:size, flexShrink:0,
    backgroundColor:"currentColor", mask:`url(${icon.src}) center / contain no-repeat`}}/>;
}
