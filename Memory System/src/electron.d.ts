import type { PetApi } from "./types";

declare global {
  interface Window {
    pet: PetApi;
  }
}

export {};

