import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Banner, Button, Card, ChoiceGroup, EmptyState, Row, Screen, Text, TextField } from '@/components/ui';
import { FOOD_CATALOG } from '@/domain/meals/catalog';
import { isExpiringSoon, type InventoryUnit } from '@/domain/meals/inventory';
import { toIsoDate } from '@/domain/shared/dates';
import { NumberField } from '@/features/onboarding/fields';
import { useDataStore } from '@/state/data';

const UNITS: InventoryUnit[] = ['g', 'ml', 'piece'];

export default function InventoryScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const { inventory, addInventoryItem, updateInventoryItem, removeInventoryItem } = useDataStore();
  const [foodId, setFoodId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | undefined>();
  const [unit, setUnit] = useState<InventoryUnit>('g');
  const [expires, setExpires] = useState('');
  const [formKey, setFormKey] = useState(0);
  const [scanInfo, setScanInfo] = useState(false);
  const today = toIsoDate(new Date());

  const add = () => {
    const food = FOOD_CATALOG.find((f) => f.id === foodId);
    if (!food || !quantity) return;
    addInventoryItem({
      foodId: food.id,
      name: food.name[lang],
      quantity,
      unit,
      category: food.category,
      expiresOn: /^\d{4}-\d{2}-\d{2}$/.test(expires) ? expires : null,
      source: 'manual',
    });
    setFoodId(null);
    setQuantity(undefined);
    setExpires('');
    setFormKey((k) => k + 1);
  };

  return (
    <Screen>
      {inventory.length === 0 ? <EmptyState message={t('inventory.empty')} /> : null}
      {inventory.map((item) => (
        <Card key={item.id}>
          <Row>
            <Text variant="heading" style={{ flex: 1 }}>
              {item.name}
            </Text>
            {isExpiringSoon(item, today) ? <Text color="warning">{t('inventory.expiring')}</Text> : null}
          </Row>
          <Text>
            {item.quantity} {t(`enums.unit.${item.unit}`)} {item.expiresOn ? `· ${item.expiresOn}` : ''}
          </Text>
          <Row>
            <Button
              compact
              variant="secondary"
              label={t('inventory.consume')}
              onPress={() =>
                updateInventoryItem(item.id, {
                  quantity: Math.max(0, item.quantity - (item.unit === 'piece' ? 1 : 100)),
                })
              }
            />
            <Button compact variant="danger" label={t('common.delete')} onPress={() => removeInventoryItem(item.id)} />
          </Row>
        </Card>
      ))}
      <Card muted>
        <Text variant="heading">{t('common.add')}</Text>
        <Text variant="label">{t('inventory.pick')}</Text>
        <ChoiceGroup
          options={FOOD_CATALOG.map((f) => ({ value: f.id, label: f.name[lang] }))}
          selected={foodId ? [foodId] : []}
          onToggle={(id) => setFoodId(id)}
        />
        <NumberField key={formKey} label={t('inventory.quantity')} value={quantity} onChange={setQuantity} />
        <ChoiceGroup
          options={UNITS.map((u) => ({ value: u, label: t(`enums.unit.${u}`) }))}
          selected={[unit]}
          onToggle={setUnit}
        />
        <TextField label={t('inventory.expires')} value={expires} onChangeText={setExpires} placeholder="2026-10-05" />
        <Button label={t('common.add')} onPress={add} disabled={!foodId || !quantity} />
        <Button variant="ghost" label={t('inventory.scan')} onPress={() => setScanInfo(true)} />
        {scanInfo ? <Banner message={t('inventory.scanUnavailable')} /> : null}
      </Card>
    </Screen>
  );
}
