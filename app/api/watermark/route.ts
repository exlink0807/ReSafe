import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, audit } from '@/lib/supabase';

/** 워터마크 코드 자체는 서버에 저장하되, 이미지 원본은 전송하지 않는다 (클라이언트에서만 심음). */
const CreateWatermarkSchema = z.object({
  code: z.string().length(16),
  plannedDate: z.string().optional(),
  destination: z.string().max(200).optional(),
  purpose: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { data, error } = await auth.db.from('watermarks').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ watermarks: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { db, user } = auth;

  const body = await req.json();
  const parsed = CreateWatermarkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { data, error } = await db
    .from('watermarks')
    .insert({
      user_id: user.id,
      code: parsed.data.code,
      planned_date: parsed.data.plannedDate ?? null,
      destination: parsed.data.destination ?? null,
      purpose: parsed.data.purpose ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await audit(db, { actor: user.id, action: 'watermark.create', target: data.id });
  return NextResponse.json({ watermark: data }, { status: 201 });
}
