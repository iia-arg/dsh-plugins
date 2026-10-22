import {GATEWAY_USAGE_LIMITS} from './usage-segments.mjs';
if(process.argv.length!==2){console.error('usage-limits: arguments are not accepted');process.exit(2)}
console.log(JSON.stringify(GATEWAY_USAGE_LIMITS));
