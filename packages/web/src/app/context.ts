import { createContext } from 'svelte';
import type { createCoordinator } from './coordinator.svelte.ts';
export const [getCoordinator, setCoordinator] =
  createContext<ReturnType<typeof createCoordinator>>();
