const express = require('express');
const path = require('path');
const fs = require('fs');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 5000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = {
  abbondanza: {
    name: 'Percorso Abbondanza e Denaro - Pack 5 Sessioni',
    price: 29900,
    successUrl: '/booking.html?product=abbondanza'
  },
  guarigione: {
    name: 'Percorso Guarigione dai Traumi - Pack 5 Sessioni',
    price: 29900,
    successUrl: '/booking.html?product=guarigione'
  },
  consapevolezza: {
    name: 'Percorso Consapevolezza Applicata - Pack 5 Sessioni',
    price: 24700,
    successUrl: '/booking.html?product=consapevolezza'
  },
  pack5: {
    name: 'Percorso Deluxe - Pack 5 Sessioni',
    price: 39900,
    successUrl: '/booking.html?product=pack5'
  },
  pack10: {
    name: 'Percorso Deluxe - Pack 10 Sessioni',
    price: 79900,
    successUrl: '/booking.html?product=pack10'
  },
  sessione: {
    name: 'Sessione Live 1:1',
    price: 8990,
    successUrl: '/booking.html?product=sessione'
  },
  mappa: {
    name: 'Mappa Natale',
    price: 2990,
    successUrl: '/success.html?product=mappa'
  },
  meditazioni: {
    name: 'Audio-Meditazioni (3 meditazioni)',
    price: 2490,
    successUrl: '/meditazioni.html?access=granted'
  }
};

const bookings = {};
const blockedDays = {};
const MAX_BOOKINGS_PER_DAY = 3;

const BLOCKED_FILE = path.join(__dirname, 'blocked-days.json');
if (fs.existsSync(BLOCKED_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(BLOCKED_FILE, 'utf8'));
    Object.assign(blockedDays, data);
  } catch (e) {
    console.log('Could not load blocked days');
  }
}

function saveBlockedDays() {
  fs.writeFileSync(BLOCKED_FILE, JSON.stringify(blockedDays, null, 2));
}

app.use(express.json());

app.get('/api/bookings/availability', (req, res) => {
  const { month, year } = req.query;
  const availability = {};
  const blocked = {};
  
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const count = bookings[dateStr] || 0;
    if (count >= MAX_BOOKINGS_PER_DAY) {
      availability[dateStr] = 'full';
    }
    if (blockedDays[dateStr]) {
      blocked[dateStr] = true;
    }
  }
  
  res.json({ availability, blocked });
});

app.post('/api/bookings/create', (req, res) => {
  const { date, time, productType } = req.body;
  
  if (!date || !time) {
    return res.status(400).json({ error: 'Data e orario richiesti' });
  }
  
  if (blockedDays[date]) {
    return res.status(400).json({ error: 'Data non disponibile' });
  }
  
  const count = bookings[date] || 0;
  if (count >= MAX_BOOKINGS_PER_DAY) {
    return res.status(400).json({ error: 'Data non disponibile' });
  }
  
  bookings[date] = count + 1;
  
  console.log(`Nuova prenotazione: ${date} alle ${time} - Prodotto: ${productType}`);
  
  res.json({ success: true, date, time });
});

app.post('/api/bookings/block', (req, res) => {
  const { date, blocked } = req.body;
  
  if (!date) {
    return res.status(400).json({ error: 'Data richiesta' });
  }
  
  if (blocked) {
    blockedDays[date] = true;
  } else {
    delete blockedDays[date];
  }
  
  saveBlockedDays();
  console.log(`Giorno ${date} ${blocked ? 'bloccato' : 'sbloccato'}`);
  
  res.json({ success: true, date, blocked });
});

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

app.post('/api/checkout', async (req, res) => {
  try {
    const { productId } = req.body;
    
    const product = PRODUCTS[productId];
    if (!product) {
      return res.status(400).json({ error: 'Prodotto non trovato' });
    }

    const domain = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DOMAINS 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : `http://localhost:${PORT}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: product.name,
          },
          unit_amount: product.price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${domain}${product.successUrl}`,
      cancel_url: `${domain}/corsi.html`,
      metadata: {
        productId: productId
      }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: 'Errore nel creare la sessione di pagamento' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log('Stripe integration active');
});
