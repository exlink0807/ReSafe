import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, audit, safeError } from '@/lib/supabase';

const CreateCaseSchema = z.object({
  caseType: z.string().min(1),
  incidentDate: z.string().optional(),
  description: z.string().max(5000).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { db } = auth;
  const { data, error } = await db.from('cases').select('*').order('created_at', { ascending: false });
  if (error) return safeError(error);
  return NextResponse.json({ cases: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { db, user } = auth;

  const body = await req.json();
  const parsed = CreateCaseSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { data, error } = await db
    .from('cases')
    .insert({
      user_id: user.id,
      case_type: parsed.data.caseType,
      incident_date: parsed.data.incidentDate ?? null,
      description: parsed.data.description ?? null,
    })
    .select()
    .single();
  if (error) return safeError(error);

  await audit(db, { caseId: data.id, actor: user.id, action: 'case.create', target: data.id });
  return NextResponse.json({ case: data }, { status: 201 });
}
