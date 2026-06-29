import { Category } from "@prisma/client";
import { CATEGORY_COLORS, categoryLabel } from "@/lib/categories";

export default function CategoryBadge({ category }: { category: Category }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[category]}`}
    >
      {categoryLabel(category)}
    </span>
  );
}
