/**
 * Las tres vistas previas (App Previews) de la App Store. Cada vídeo sale de
 * una grabación de pantalla del iPhone en raw/ y se monta con sus tramos en
 * orden: `from` y `to` son segundos de la grabación, y `caption` el texto que
 * se ve arriba mientras dura el tramo (con \n se fuerza el salto de línea).
 *
 * Apple admite entre 15 y 30 segundos por vídeo. El primero es el que se
 * reproduce solo en los resultados de búsqueda.
 */
module.exports = {
  videos: [
    {
      out: '1-tu-mes.mp4',
      source: 'raw/1.mov',
      segments: [
        { from: 0, to: 4, caption: '¿Cuánto te queda\neste mes?' },
        { from: 4, to: 11, caption: 'Apunta un gasto\nen segundos' },
        { from: 11, to: 17, caption: 'Descubre a dónde\nva tu dinero' },
        { from: 17, to: 23, caption: 'Tu año,\nmes a mes' },
      ],
    },
    {
      out: '2-en-pareja.mp4',
      source: 'raw/2.mov',
      segments: [
        { from: 0, to: 5, caption: 'Cuentas en pareja\no en familia' },
        { from: 5, to: 11, caption: 'Todos veis lo mismo\nal momento' },
        { from: 11, to: 17, caption: 'Invita con\nun enlace' },
        { from: 17, to: 22, caption: 'Exporta a Excel,\nPDF o CSV' },
      ],
    },
    {
      out: '3-ahorra.mp4',
      source: 'raw/3.mov',
      segments: [
        { from: 0, to: 6, caption: 'Ahorra para\nlo que importa' },
        { from: 6, to: 12, caption: 'Tus gastos fijos,\nen automático' },
        { from: 12, to: 17, caption: 'Oculta los importes\ncon un toque' },
        { from: 17, to: 22, caption: 'Sin anuncios\ny a tu color' },
      ],
    },
  ],
};
