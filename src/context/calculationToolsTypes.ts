export type Note = {
  id: string;
  calculationId: string;
  x: number;
  y: number;
  text: string;
};

export type Tag = {
  id: string;
  calculationId: string;
  color: string;
  label: string;
};

export type CalculationToolsContextValue = {
  addNote: () => void;
  openTagModal: () => void;
  openInterestCalculator: () => void;
  beginNewCalculation: () => void;
  registerCaseId: (id: string | null | undefined) => void;
};
