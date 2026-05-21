import { createClient } from '@supabase/supabase-js';
import { PRESCRIPTIONS } from './prescriptions.mjs';

let _client = null;
export function getSupabase() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  _client = createClient(url, key);
  return _client;
}

export async function markScanning(scanId) {
  const supabase = getSupabase();
  await supabase.from('scan_results').update({ status: 'scanning' }).eq('id', scanId);
}

export async function markFailed(scanId, message = '스캔 중 오류가 발생했습니다') {
  const supabase = getSupabase();
  await supabase.from('scan_results').update({
    status: 'failed',
    error_message: message,
  }).eq('id', scanId);
}

// ─── 단일 스캔 결과 저장 ──────────────────────────────────────────────────
export async function writeSingleScanResult(scanId, scanResult) {
  const supabase = getSupabase();

  const summary = {};
  const tags = scanResult.tags;
  for (const [key, tag] of Object.entries(tags)) {
    summary[key] = tag.status;
  }

  const hosting = scanResult.hosting || { id: 'general', name: '일반' };

  const { error: updateErr } = await supabase
    .from('scan_results')
    .update({
      status: 'completed',
      score: scanResult.score,
      total_trackers: scanResult.summary.totalTags,
      installed_trackers: scanResult.summary.detectedCount,
      summary,
      raw_result: scanResult,
      scanned_at: scanResult.scannedAt,
      hosting_id: hosting.id,
      hosting_name: hosting.name,
    })
    .eq('id', scanId);

  if (updateErr) throw new Error(`scan_results update failed: ${updateErr.message}`);

  // tracker_diagnoses 생성
  const diagnoses = [];
  for (const [key, tag] of Object.entries(tags)) {
    let status = tag.status;
    if (status === 'ok' && !tag.hasEventFire && PRESCRIPTIONS[key]?.no_event) {
      status = 'no_event';
    }

    let prescription = null;
    if (status === 'not_installed') {
      prescription = tag.kakaoSdkOnly
        ? (PRESCRIPTIONS[key]?.not_installed_sdk_only ?? null)
        : (PRESCRIPTIONS[key]?.not_installed ?? null);
    } else if (status === 'duplicate') {
      prescription = PRESCRIPTIONS[key]?.duplicate ?? null;
    } else if (status === 'multi_container') {
      prescription = PRESCRIPTIONS[key]?.multi_container ?? null;
    } else if (status === 'no_event' || status === 'missing_events' || status === 'partial_events') {
      prescription = PRESCRIPTIONS[key]?.no_event ?? null;
    }

    let trackerScore = 0;
    if (tag.detected) {
      if (tag.isDuplicate) trackerScore = 60;
      else if (tag.isMultiContainer) trackerScore = 90;
      else if (status === 'missing_events') trackerScore = 50;
      else if (status === 'partial_events') trackerScore = 70;
      else if (status === 'no_event') trackerScore = 80;
      else trackerScore = 100;
    }

    diagnoses.push({
      scan_id: scanId,
      tracker_key: key,
      tracker_name: tag.name,
      status,
      script_count: tag.scriptLoadCount,
      event_count: tag.eventFireCount,
      ids: tag.ids || [],
      globals_found: [],
      prescription,
      score: trackerScore,
    });
  }

  const { error: diagErr } = await supabase.from('tracker_diagnoses').insert(diagnoses);
  if (diagErr) throw new Error(`tracker_diagnoses insert failed: ${diagErr.message}`);
}

// ─── 멀티 스캔 결과 저장 ──────────────────────────────────────────────────
export async function writeMultiScanResult(scanId, result) {
  const supabase = getSupabase();

  const validPages = (result.pages || []).filter((p) => !p.error);

  const summary = {};
  if (validPages.length > 0) {
    for (const [key, tag] of Object.entries(validPages[0].tags)) {
      summary[key] = tag.status;
    }
  }

  const totalTags = Object.keys(validPages[0]?.tags || {}).length;
  const installedTrackers = new Set();
  for (const pg of validPages) {
    for (const [key, tag] of Object.entries(pg.tags)) {
      if (tag.detected) installedTrackers.add(key);
    }
  }

  const hosting = result.hosting || { id: 'general', name: '일반' };

  const { error } = await supabase
    .from('scan_results')
    .update({
      status: 'completed',
      score: result.overallScore,
      total_trackers: totalTags,
      installed_trackers: installedTrackers.size,
      summary,
      raw_result: result,
      scanned_at: result.scannedAt,
      hosting_id: hosting.id,
      hosting_name: hosting.name,
    })
    .eq('id', scanId);

  if (error) throw new Error(`scan_results update failed: ${error.message}`);
}
