export const ATTRIBUTION_STATEMENT_GENERATED =
  '> Generated with Stitch<sup>[^](https://github.com/thealternator89/stitch/#readme)</sup> and GitHub Copilot<sup>[^](https://github.com/features/copilot)</sup>.';

export const ATTRIBUTION_STATEMENT_ASSISTED =
  '> Assisted by Stitch<sup>[^](https://github.com/thealternator89/stitch/#readme)</sup> and GitHub Copilot<sup>[^](https://github.com/features/copilot)</sup>.';

export const getAttributionStatement = (edited?: boolean): string => {
  return edited
    ? ATTRIBUTION_STATEMENT_ASSISTED
    : ATTRIBUTION_STATEMENT_GENERATED;
};
