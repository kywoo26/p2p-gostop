// NF-09 / plan §1.3·1.8: 두 린터의 경로 검사가 놓치는 import() 형태를 금지한다.
// Oxlint의 내장 no-dynamic-require도 치환 없는 템플릿을 허용하므로 로컬 규칙을 공유한다.
export default {
  meta: { name: 'workspace' },
  rules: {
    'string-literal-imports': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          literal:
            'import() 경로는 따옴표 문자열 리터럴로 명시한다. 템플릿·계산된 경로로 경계 검사를 우회하지 않는다 (AGENTS.md §4).',
        },
      },
      create(context) {
        return {
          ImportExpression(node) {
            if (node.source.type !== 'Literal' || typeof node.source.value !== 'string') {
              context.report({ node: node.source, messageId: 'literal' });
            }
          },
        };
      },
    },
  },
};
