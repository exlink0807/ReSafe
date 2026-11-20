import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, audit } from '@/lib/supabase';
import { REMOVAL_STATUSES } from '@/lib/types';

const CreateRemovalSchema = z.object({
  caseId: z.string().uuid(),
  traceResultId: z.string().uuid().optional(),
  platform: z.string().min(1),
});

const UpdateRemovalSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(REMOVAL_STATUSES as [string, ...string[]]),
});

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { db, user } = auth;

  const body = await req.json();
  const parsed = CreateRemovalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { data, error } = await db
    .from('removal_requests')
    .insert({ case_id: parsed.data.caseId, trace_result_id: parsed.data.traceResultId ?? null, platform: parsed.data.platform })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await audit(db, { caseId: parsed.data.caseId, actor: user.id, action: 'removal.create', target: data.id });
  return NextResponse.json({ removal: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { db, user } = auth;

  const body = await req.json();
  const parsed = UpdateRemovalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const resolvedAt = parsed.data.status === 'removed' || parsed.data.status === 'rejected' ? new Date().toISOString() : null;
  const { data, error } = await db
    .from('removal_requests')
    .update({ status: parsed.data.status, resolved_at: resolvedAt })
    .eq('id', parsed.data.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await audit(db, { actor: user.id, action: 'removal.status_update', target: `${parsed.data.id}:${parsed.data.status}` });
  return NextResponse.json({ removal: data });
}
