import type { ExternalZone, ZoneStatus } from './auction.types';

/** Normalize API / socket ids: string, number, or `{ $oid }` from JSON. */
export function normalizeEntityId(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  if (typeof raw === 'object' && raw !== null && '$oid' in raw) {
    const oid = (raw as { $oid: unknown }).$oid;
    return oid != null ? String(oid).trim() : '';
  }
  return '';
}

type PincodeAreaGroup = {
  pincode: string;
  areas: string[];
  pincodeDocId?: string;
};

export function extractZonesArrayFromResponse(res: unknown): unknown[] {
  if (Array.isArray(res)) {
    return res;
  }
  if (res && typeof res === 'object') {
    const o = res as Record<string, unknown>;
    for (const key of ['data', 'zones', 'list', 'result', 'records']) {
      const v = o[key];
      if (Array.isArray(v)) {
        return v;
      }
    }
  }
  return [];
}

function buildPincodeAreaGroups(
  pincodes: string[],
  pincodeData: Record<string, unknown>[]
): PincodeAreaGroup[] {
  return pincodes.map((pc) => {
    const normalized = String(pc).trim();
    const areas = new Set<string>();
    let docId = '';
    for (const row of pincodeData) {
      const rowPc = String(row['pincode'] ?? '').trim();
      if (rowPc !== normalized) continue;
      const area = String(row['area'] ?? '').trim();
      if (area) areas.add(area);
      const id = normalizeEntityId(row['_id']);
      if (id) docId = id;
    }
    return {
      pincode: normalized,
      areas: Array.from(areas),
      pincodeDocId: docId || undefined,
    };
  });
}

function buildPincodeAreaGroupsFromDetails(
  pincodes: string[],
  pincodesRef: string[],
  pincodeDetails: Record<string, unknown>[]
): PincodeAreaGroup[] {
  const byId = new Map<string, Record<string, unknown>>();
  const byPin = new Map<string, Record<string, unknown>>();
  for (const row of pincodeDetails) {
    const id = normalizeEntityId(row['_id']);
    const pc = String(row['pincode'] ?? '').trim();
    if (id) byId.set(id, row);
    if (pc) byPin.set(pc, row);
  }

  return pincodes.map((pcRaw, i) => {
    const normalized = String(pcRaw).trim();
    let row: Record<string, unknown> | undefined;
    const refId = pincodesRef[i];
    if (refId) {
      row = byId.get(refId);
    }
    if (!row) {
      row = byPin.get(normalized);
    }
    const areas: string[] = [];
    if (row) {
      const area = String(row['area'] ?? '').trim();
      if (area) areas.push(area);
    }
    const docId = row ? normalizeEntityId(row['_id']) : '';
    return {
      pincode: normalized,
      areas,
      pincodeDocId: docId || undefined,
    };
  });
}

function buildPincodeAreaGroupsFromDetailsOnly(
  pincodeDetails: Record<string, unknown>[]
): PincodeAreaGroup[] {
  return pincodeDetails.map((row) => {
    const pc = String(row['pincode'] ?? '').trim();
    const area = String(row['area'] ?? '').trim();
    const docId = normalizeEntityId(row['_id']);
    return {
      pincode: pc,
      areas: area ? [area] : [],
      pincodeDocId: docId || undefined,
    };
  });
}

function mapApiZoneStatus(o: Record<string, unknown>): ZoneStatus {
  const s = String(o['status'] ?? o['auctionStatus'] ?? o['zoneStatus'] ?? '').toLowerCase();
  if (s.includes('active') || s === 'live') return 'active';
  if (s.includes('close')) return 'closed';
  if (s.includes('config') || o['isConfigured'] === true || o['configured'] === true) {
    return 'configured';
  }
  return 'not_configured';
}

/**
 * Maps one zone document from `POST admin/getzonesList` (same shape as place-bid).
 */
export function mapZoneDocumentToExternalZone(
  raw: unknown,
  fallbackState: string,
  fallbackCity: string
): ExternalZone | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = normalizeEntityId(o['_id']);
  if (!id) return null;

  const name = String(o['name'] ?? 'Zone').trim() || 'Zone';
  const state = String(o['state'] ?? fallbackState).trim() || fallbackState;
  const city = String(o['city'] ?? fallbackCity).trim() || fallbackCity;

  const pincodesRaw = o['pincodes'];
  const pincodes: string[] = Array.isArray(pincodesRaw)
    ? pincodesRaw.map((p) => String(p).trim()).filter((s) => s.length > 0)
    : [];

  const pincodeDataRaw = o['pincodeData'];
  const pincodeData: Record<string, unknown>[] = Array.isArray(pincodeDataRaw)
    ? pincodeDataRaw.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    : [];

  const pincodeDetailsRaw = o['pincodeDetails'];
  const pincodeDetails: Record<string, unknown>[] = Array.isArray(pincodeDetailsRaw)
    ? pincodeDetailsRaw.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    : [];

  const pincodesRefRaw = o['pincodesRef'];
  const pincodesRef: string[] = Array.isArray(pincodesRefRaw)
    ? pincodesRefRaw.map((r) => normalizeEntityId(r)).filter((s) => s.length > 0)
    : [];

  let pincodeGroups: PincodeAreaGroup[];
  if (pincodeDetails.length > 0) {
    pincodeGroups =
      pincodes.length > 0
        ? buildPincodeAreaGroupsFromDetails(pincodes, pincodesRef, pincodeDetails)
        : buildPincodeAreaGroupsFromDetailsOnly(pincodeDetails);
  } else {
    pincodeGroups = buildPincodeAreaGroups(pincodes, pincodeData);
  }
  const areaNames = Array.from(new Set(pincodeGroups.flatMap((g) => g.areas)));
  const pincodesOut = pincodeGroups.map((g) => g.pincode).filter((s) => s.length > 0);

  const amountCharge = Math.max(0, Math.round(Number(o['amount_charge']) || 0));

  return {
    id,
    name,
    state,
    city,
    pincodes: pincodesOut.length ? pincodesOut : pincodes,
    areaNames,
    status: mapApiZoneStatus(o),
    amountCharge,
  };
}
