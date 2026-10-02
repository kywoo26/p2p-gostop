import type { ReturnRoute } from './app/navigation.ts';
declare global {
  namespace App {
    interface PageState {
      returnTo?: ReturnRoute;
      settingsSection?: 'play' | 'comfort' | 'connection';
    }
  }
}
export {};
