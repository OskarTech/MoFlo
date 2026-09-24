// Las pruebas de fechas dependen de la zona horaria (una hucha que aporta el
// día 31, un cargo guardado a las 12:00...). Se fija la de España para que den
// el mismo resultado en cualquier ordenador.
module.exports = async () => {
  process.env.TZ = 'Europe/Madrid';
};
