'use strict';
const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { createReserveState } = require('../js/world');
const {
  choiceAvailability,
  choiceById,
  reservedDevelopmentMaterials,
  surplusTradeAmount,
  selectReserveDevelopmentPlan
} = require('../js/reserveDevelopment');
const {
  proposeAutoExchange,
  wildernessTradeOffer,
  bestWildernessTradeItem,
  noteSandboxExchangeItem,
  settleWildernessTrade,
  wildernessTradePreview
} = require('../js/wildernessKnowledge');
const { friendAidMarkers, sendFriendAidRequest } = require('../js/friendAidSystem');

function reserveWithStock(stock) {
  const reserve = createReserveState();
  reserve.wildernessKnowledge = Object.assign({}, reserve.wildernessKnowledge || {}, {
    tradeStock: Object.assign({}, stock)
  });
  return reserve;
}

const reserved = reservedDevelopmentMaterials(createReserveState());
assert.equal(reserved.reed_cord, 2, 'unbuilt river and meadow each keep one reed bundle');
assert.equal(reserved.pinecone_humidity, 2, 'unbuilt river and forest each keep one pinecone');
assert.equal(reserved.seedpod_alarm, 1);
assert.equal(reserved.track_cast, 1);
assert.equal(reserved.feather_wind_tag, 2);

{
  const reserve = reserveWithStock({ reed_cord: 1, pinecone_humidity: 1 });
  assert.equal(surplusTradeAmount(reserve, 'reed_cord'), 0, 'the just-collected reed is reserved for construction');
  assert.equal(surplusTradeAmount(reserve, 'pinecone_humidity'), 0, 'the just-collected pinecone is reserved for construction');
  assert.equal(proposeAutoExchange(reserve), null, 'needed building materials must not start an exchange');
  assert.equal(wildernessTradeOffer(reserve, 'reed_cord', 1).ready, false, 'manual trade cannot give away the last reed');
  assert.equal(wildernessTradeOffer(reserve, 'pinecone_humidity', 1).ready, false);
  assert.equal(bestWildernessTradeItem(reserve), null);
  const reed = choiceById('reed_refuge', 'river_shallows');
  const availability = choiceAvailability(reserve, reed);
  assert.ok(!availability.missing.some((item) => /芦苇|松果/.test(item)), 'both collected materials must still be available to build');
  noteSandboxExchangeItem(reserve, 'pinecone_humidity', 1_000);
  assert.equal(friendAidMarkers(reserve, 1_000).length, 0, 'just obtaining a needed building material must not spawn an exchange marker');
}

{
  const reserve = reserveWithStock({ reed_cord: 1, pinecone_humidity: 1, resin_tinder: 2 });
  const proposal = proposeAutoExchange(reserve);
  assert.ok(proposal && proposal.offer.id === 'resin_tinder', 'only leftover non-building stock may be offered');
  assert.equal(proposal.offerStock, 2);
  const sent = sendFriendAidRequest(reserve, [], 2_000);
  assert.ok(sent.ok);
  assert.equal(sent.proposal.offer.id, 'resin_tinder');
  assert.notEqual(sent.proposal.offer.id, 'reed_cord');
  assert.notEqual(sent.proposal.offer.id, 'pinecone_humidity');
  assert.ok(reserve.wildernessKnowledge.tradeStock.reed_cord >= 1, 'exchange must not take the reserved reed');
  assert.ok(reserve.wildernessKnowledge.tradeStock.pinecone_humidity >= 1, 'exchange must not take the reserved pinecone');
  assert.equal(reserve.wildernessKnowledge.tradeStock.resin_tinder, 1, 'exchange spends one surplus resin');
}

{
  const reserve = reserveWithStock({ pinecone_humidity: 3 });
  assert.equal(surplusTradeAmount(reserve, 'pinecone_humidity'), 1, 'a third pinecone is surplus after two construction holds');
  const proposal = proposeAutoExchange(reserve);
  assert.ok(proposal && proposal.offer.id === 'pinecone_humidity');
  assert.equal(proposal.offerStock, 1);
}

{
  const state = createCharacter(null, '建设后多余可换');
  const reserve = state.world.reserve;
  reserve.fund = 2000;
  reserve.wildernessKnowledge = Object.assign({}, reserve.wildernessKnowledge || {}, {
    tradeStock: { reed_cord: 1, pinecone_humidity: 3 }
  });
  assert.equal(surplusTradeAmount(reserve, 'pinecone_humidity'), 1);
  const built = selectReserveDevelopmentPlan(reserve, 'river_shallows', 'reed_refuge', 1);
  assert.ok(built.ok, built.error || 'reed refuge should consume reserved materials');
  assert.equal(reserve.wildernessKnowledge.tradeStock.pinecone_humidity, 2);
  assert.ok(surplusTradeAmount(reserve, 'pinecone_humidity') >= 1, 'after the river building is placed, leftover pinecone becomes surplus');
}

{
  const reserve = reserveWithStock({ reed_cord: 1, pinecone_humidity: 1, resin_tinder: 2 });
  assert.equal(noteSandboxExchangeItem(reserve, 'pinecone_humidity', 1_000), null, '建设预留物资不得武装交换图标');
  assert.equal(friendAidMarkers(reserve, 1_000).length, 0, '捡到建设预留物资时，即使另有溢出库存也不能立刻推交换');
  assert.ok(noteSandboxExchangeItem(reserve, 'resin_tinder', 2_000));
  const markers = friendAidMarkers(reserve, 2_000);
  assert.equal(markers[0] && markers[0].type, 'friendAidRequest');
  assert.ok(/松脂/.test(markers[0].title), '图标必须拿出刚出现的溢出物资');
  const proposal = proposeAutoExchange(reserve);
  assert.equal(proposal.offer.id, 'resin_tinder');
  assert.equal(proposal.wantStock, 0, '自动求援必须优先没有的生存物资');
}

{
  const reserve = reserveWithStock({ reed_cord: 1 });
  const preview = wildernessTradePreview(reserve, 'reed_cord', 'friends', { id: 'npc_ache', name: '阿澈', simulated: true }, 'resin_tinder');
  const settled = settleWildernessTrade(reserve, Object.assign({}, preview, { ready: true }), {
    tradeId: 'reserved_block_1',
    status: 'matched',
    day: 1
  });
  assert.equal(settled.ok, false);
  assert.equal(settled.reason, 'reserved');
  assert.equal(reserve.wildernessKnowledge.tradeStock.reed_cord, 1);
}

console.log('surplus exchange building check ok');
