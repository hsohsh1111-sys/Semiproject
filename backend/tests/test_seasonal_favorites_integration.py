from tests.test_auth import client, signup, login
from app.models import SeasonalFavorite


def test_favorites_are_private_idempotent_and_deleted(client):
    c, engine = client
    SeasonalFavorite.__table__.create(engine)
    endpoint = '/api/outfits/favorites'
    assert c.get(endpoint).status_code == 401
    assert signup(c).status_code == 201
    headers = {'Authorization': 'Bearer ' + login(c).json()['access_token']}
    item = dict(id='test:shirt', title='Test shirt', imageUrl='https://example.invalid/shirt.png',
                price=15000, currencyCode='KRW', type='top', lookTitle='Test look',
                season='spring', style='casual', age='20s', gender='unisex')
    saved = c.post(endpoint, json=item, headers=headers)
    assert saved.status_code == 200, saved.text
    assert saved.json()['id'] == item['id']
    assert saved.json()['createdAt']
    assert c.post(endpoint, json={**item, 'price': 16000}, headers=headers).status_code == 200
    listing = c.get(endpoint, headers=headers).json()
    # Repeated saves preserve the original saved-price snapshot.
    assert len(listing) == 1 and listing[0]['price'] == 15000
    assert signup(c, 'other@example.com').status_code == 201
    other = {'Authorization': 'Bearer ' + login(c, 'other@example.com').json()['access_token']}
    assert c.get(endpoint, headers=other).json() == []
    assert c.delete(endpoint, params={'favorite_key': item['id']}, headers=other).status_code == 204
    assert len(c.get(endpoint, headers=headers).json()) == 1
    assert c.delete(endpoint, params={'favorite_key': item['id']}, headers=headers).status_code == 204
    assert c.get(endpoint, headers=headers).json() == []
    assert c.post(endpoint, json={**item, 'price': -1}, headers=headers).status_code == 422
