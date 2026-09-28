// 사용: ./dev.sh sim -- [seed]
import { previewDeal } from './index.ts';

const seed = Number(process.argv[2] ?? 1);
console.log(JSON.stringify(previewDeal(seed), null, 2));
