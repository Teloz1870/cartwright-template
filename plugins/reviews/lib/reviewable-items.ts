/**
 * The order lines a customer can review: those whose product still exists.
 *
 * Since schema batch A an OrderItem can outlive its product — `productId` and
 * `product` are nullable, because an imported historic order may name a
 * product the shop no longer has. Such a line has nothing to review and no
 * page to link to, so every review surface skips it. A line from a normal
 * checkout always has both, so for those this is the identity.
 */
type Reviewable<T extends { productId: string | null; product: unknown }> = T & {
  productId: string;
  product: NonNullable<T["product"]>;
};

export function reviewableItems<T extends { productId: string | null; product: unknown }>(
  items: T[],
): Reviewable<T>[] {
  return items.filter(
    (i): i is Reviewable<T> => i.productId !== null && i.product != null,
  );
}
