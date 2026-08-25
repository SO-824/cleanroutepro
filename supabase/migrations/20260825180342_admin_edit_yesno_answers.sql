-- Admin corrections v3: toggles may also set/clear a Yes/No answer —
-- {"fieldId","answer":"yes"|"no"|null} — alongside the checkbox shape
-- {"fieldId","value"} and the multi-select option shape
-- {"fieldId","option","selected"}. Yes/No answers are stored as the same
-- 'yes'/'no' strings the staff form writes (never booleans: countAnswered
-- treats boolean false as "unanswered"); answer null clears to unanswered,
-- mirroring the staff form's tap-again-to-clear behaviour.
CREATE OR REPLACE FUNCTION public.admin_edit_completion(
  p_completion_id uuid,
  p_editor uuid,
  p_toggles jsonb DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_set_notes boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_items jsonb;
  v_orig_items jsonb;
  v_orig_notes text;
  t jsonb;
  v_fid text;
  v_val boolean;
  v_opt text;
  v_sel boolean;
  v_ans text;
  v_arr jsonb;
BEGIN
  PERFORM set_config('app.admin_edit', 'on', true);

  SELECT items, original_items, COALESCE(original_notes, notes, '')
    INTO v_items, v_orig_items, v_orig_notes
    FROM checklist_completions WHERE id = p_completion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'completion not found'; END IF;

  v_orig_items := COALESCE(v_orig_items, v_items);

  IF jsonb_typeof(v_items) = 'string' THEN
    v_items := (v_items #>> '{}')::jsonb;
  END IF;
  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' THEN
    v_items := '[]'::jsonb;
  END IF;

  IF p_toggles IS NOT NULL THEN
    FOR t IN SELECT * FROM jsonb_array_elements(p_toggles) LOOP
      v_fid := t->>'fieldId';

      IF t ? 'answer' THEN
        -- Yes/No answer: 'yes' | 'no' | null (clear back to unanswered)
        v_ans := t->>'answer';
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) e WHERE e->>'fieldId' = v_fid) THEN
          v_items := (
            SELECT jsonb_agg(CASE WHEN e->>'fieldId' = v_fid
              THEN e || jsonb_build_object('value', COALESCE(to_jsonb(v_ans), 'null'::jsonb), 'na', false)
              ELSE e END)
            FROM jsonb_array_elements(v_items) e);
        ELSIF v_ans IS NOT NULL THEN
          v_items := v_items || jsonb_build_array(jsonb_build_object('fieldId', v_fid, 'value', v_ans));
        END IF;

      ELSIF t ? 'option' THEN
        -- Option toggle inside a multi-select list
        v_opt := t->>'option';
        v_sel := (t->>'selected')::boolean;
        SELECT e->'value' INTO v_arr FROM jsonb_array_elements(v_items) e
          WHERE e->>'fieldId' = v_fid LIMIT 1;
        IF v_arr IS NULL OR jsonb_typeof(v_arr) <> 'array' THEN
          v_arr := '[]'::jsonb;
        END IF;
        IF v_sel THEN
          IF NOT (v_arr ? v_opt) THEN v_arr := v_arr || to_jsonb(v_opt); END IF;
        ELSE
          SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_arr
            FROM jsonb_array_elements(v_arr) x WHERE x <> to_jsonb(v_opt);
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) e WHERE e->>'fieldId' = v_fid) THEN
          v_items := (
            SELECT jsonb_agg(CASE WHEN e->>'fieldId' = v_fid
              THEN e || jsonb_build_object('value', v_arr, 'na', false)
              ELSE e END)
            FROM jsonb_array_elements(v_items) e);
        ELSE
          v_items := v_items || jsonb_build_array(jsonb_build_object('fieldId', v_fid, 'value', v_arr));
        END IF;

      ELSE
        -- Plain checkbox toggle
        v_val := (t->>'value')::boolean;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) e WHERE e->>'fieldId' = v_fid) THEN
          v_items := (
            SELECT jsonb_agg(CASE WHEN e->>'fieldId' = v_fid
              THEN e || jsonb_build_object('value', v_val, 'na', false)
              ELSE e END)
            FROM jsonb_array_elements(v_items) e);
        ELSE
          v_items := v_items || jsonb_build_array(jsonb_build_object('fieldId', v_fid, 'value', v_val));
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE checklist_completions SET
    original_items  = v_orig_items,
    original_notes  = v_orig_notes,
    items           = v_items,
    notes           = CASE WHEN p_set_notes THEN p_notes ELSE notes END,
    admin_edited_at = now(),
    admin_edited_by = p_editor
  WHERE id = p_completion_id;
END $$;
