export const STITCH_ATTRIBUTION =
  'Stitch<sup>[^](https://github.com/thealternator89/stitch/#readme)</sup>';

export const COPILOT_ATTRIBUTION =
  'GitHub Copilot<sup>[^](https://github.com/features/copilot)</sup>';

export const ATTRIBUTION_STATEMENT_GENERATED = `> Generated with ${STITCH_ATTRIBUTION} and ${COPILOT_ATTRIBUTION}.`;

export const ATTRIBUTION_STATEMENT_ASSISTED = `> Assisted by ${STITCH_ATTRIBUTION} and ${COPILOT_ATTRIBUTION}.`;

export const getAttributionStatement = (edited?: boolean): string => {
  return edited
    ? ATTRIBUTION_STATEMENT_ASSISTED
    : ATTRIBUTION_STATEMENT_GENERATED;
};
