import { useCurrentSemester } from '../../lib/scheduling';
import { Select } from '../ui';

export default function SemesterPicker() {
  const { semesters, current, select } = useCurrentSemester();
  return (
    <div className="w-60">
      <Select aria-label="Semester" value={current?.id ?? ''} onChange={(e) => select(Number(e.target.value))}
        options={semesters.map((s) => ({ value: s.id, label: `${s.academicYear?.label ?? ''} · ${s.name}` }))} placeholder={semesters.length ? undefined : 'No semesters'} />
    </div>
  );
}
