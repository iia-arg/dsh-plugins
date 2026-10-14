import assert from 'node:assert/strict';
import {looksLikeStop} from '../src/mail-stop-arrival.js';
export const ordinaryMailControl={ingest(raw){assert.equal(looksLikeStop(raw),false,'this legacy fixture does not cover signed stop; use native ingress stand');return false;}};
