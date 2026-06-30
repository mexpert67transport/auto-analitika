const text = "W) № Товар Кол-во Ед. Цена Скидка в т.ч. НДС Всего Артикул 1 Болт M16x1.5x120 амортизатора 10.9";
const chunks = text.split(/(?:^|\s)(?=\d{1,2}\s+[А-ЯЁа-яёA-Za-z])/);
console.log(chunks);
