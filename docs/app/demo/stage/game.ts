export type StagePoint = [number, number, number];
export type DialogueAction = "talk" | "examine" | "interact";
export type DialogueLibrary = Record<string, Partial<Record<DialogueAction, string[]>>>;
