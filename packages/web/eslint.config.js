// packages/web 전용 ESLint 10 flat config (plan.md 1.8: .svelte 템플릿 린트는 Oxc 미지원 → web만 ESLint).
// 순수 TS 패키지는 루트 .oxlintrc.json(oxlint)을 쓴다. 규칙은 문서가 아니라 린트로 강제한다 (plan.md 원칙 9).
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';
import workspace from '../../lint-imports.mjs';

// 게스트 페이지는 비보안 컨텍스트(http://192.168.x.y)에서 돈다. Secure Context 전용 API 금지 (spec NF-02, AGENTS.md 3장).
const insecureContextMessage =
  '비보안 컨텍스트(게스트 http origin)에서 쓸 수 없는 API입니다 (spec NF-02, AGENTS.md 3장).';
const bannedNavigatorProps = [
  'wakeLock',
  'share',
  'canShare',
  'clipboard',
  'serviceWorker',
  'vibrate',
];
const bannedCryptoProps = ['subtle', 'randomUUID'];
const bannedFullscreen = ['requestFullscreen', 'webkitRequestFullscreen', 'webkitEnterFullscreen'];

// workspace 내부 파일을 우회 참조하지 않는다. engine/testing·web/net은 명시된 공개 하위 경로다.
const boundaryPatterns = [
  '^@p2p-gostop/(relay-dev|sim)(/|$)',
  '^@p2p-gostop/(?!(?:engine/testing|web/net)$)[^/]+/',
  '^\\..*/(packages|tools|engine|ai|protocol|web|relay-dev|sim)(/|$)',
];
const boundaryMessage = 'web은 engine·ai·protocol의 공개 API만 참조한다 (plan §1.3, refactor R2).';
// ESLint no-restricted-imports는 정적 import/export만 검사한다. 문자열 동적 import도 같은 경계로 검사한다.
const boundarySelectors = boundaryPatterns.map((pattern) => ({
  selector: `ImportExpression[source.value=/${pattern.replaceAll('/', '\\u002F')}/]`,
  message: boundaryMessage,
}));

const importRestrictions = {
  'workspace/string-literal-imports': 'error',
  'no-restricted-imports': [
    'error',
    { patterns: boundaryPatterns.map((regex) => ({ regex, message: boundaryMessage })) },
  ],
  'no-restricted-syntax': ['error', ...boundarySelectors],
};

const webRestrictions = {
  'no-restricted-properties': [
    'error',
    ...bannedNavigatorProps.map((property) => ({
      object: 'navigator',
      property,
      message: insecureContextMessage,
    })),
    ...bannedCryptoProps.map((property) => ({
      object: 'crypto',
      property,
      message: `${insecureContextMessage} 난수는 crypto.getRandomValues, 해시는 순수 JS SHA-256.`,
    })),
    ...bannedFullscreen.map((property) => ({ property, message: insecureContextMessage })),
  ],
  'no-restricted-syntax': [
    'error',
    ...boundarySelectors,
    {
      // window.navigator.share, globalThis.navigator.clipboard 같은 우회 접근
      selector: `MemberExpression[object.property.name='navigator'][property.name=/^(${bannedNavigatorProps.join('|')})$/]`,
      message: insecureContextMessage,
    },
    {
      selector: `MemberExpression[object.property.name='crypto'][property.name=/^(${bannedCryptoProps.join('|')})$/]`,
      message: insecureContextMessage,
    },
    {
      // screen.orientation.lock()
      selector: "MemberExpression[object.property.name='orientation'][property.name='lock']",
      message: insecureContextMessage,
    },
    {
      selector:
        "MemberExpression[object.name=/^(window|self|globalThis)$/][property.name='caches']",
      message: insecureContextMessage,
    },
  ],
  'no-restricted-globals': ['error', { name: 'caches', message: insecureContextMessage }],
};

export default defineConfig(
  globalIgnores(['dist/', 'test-results/', 'playwright-report/']),
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  svelte.configs.prettier,
  {
    plugins: { workspace },
    rules: {
      ...importRestrictions,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    // Node에서 도는 설정 파일·빌드 스크립트·Playwright 테스트
    files: ['*.{js,ts}', 'scripts/**/*.mjs', 'e2e/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // 브라우저에서 도는 앱 코드
    files: ['src/**/*.{ts,js,svelte}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['src/**/*.{ts,js,svelte}'],
    rules: webRestrictions,
  },
);
