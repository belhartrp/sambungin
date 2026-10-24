import { splitDisplayTail } from '@/lib/normalize';

/**
 * Menampilkan kata dengan N huruf terakhir disorot: bagian itulah yang harus disambung lawan.
 * Sorotan adalah informasi fungsional (aturan sambungan), bukan dekorasi.
 */
export function TailWord({
  word,
  tail,
  highlight = true,
  className,
}: {
  word: string;
  tail: number;
  highlight?: boolean;
  className?: string;
}) {
  if (!highlight || tail <= 0) return <span className={className}>{word}</span>;
  const [head, end] = splitDisplayTail(word, tail);
  return (
    <span className={className}>
      {head}
      <span className="rounded-[5px] bg-accent-soft px-[2px] font-bold text-accent-strong">{end}</span>
    </span>
  );
}
