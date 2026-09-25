import type { ColorPaletteId } from './index';

// Colores de las categorías de cada paleta, con un juego para modo claro y otro
// para oscuro (en oscuro, todos con al menos 3:1 de contraste sobre la tarjeta).
// Comprobados con un simulador de daltonismo (protanopía y deuteranopía): los
// colores que quedan juntos en el gráfico se distinguen en las 10 paletas.
//
// - Gastos: 8 colores, uno fijo para cada categoría (ver utils/categoryColors),
//   más un gris con un toque de la paleta para "Otros". Ninguno es verde ni
//   turquesa: esos tonos quedan para los ingresos, para no confundirlos.
// - Ingresos: 12 verdes, que se reparten por puesto (el que más suma, el
//   primero). Son los de siempre, con un ligero toque de cada paleta.
export interface CategoryColorSet {
  expense: string[];
  expenseOther: string;
  income: string[];
}

export const CATEGORY_COLORS: Record<ColorPaletteId, { light: CategoryColorSet; dark: CategoryColorSet }> = {
  // Verde
  green: {
    light: {
      expense: [
        '#E0A907', '#07A0D1', '#E85896', '#816BEF',
        '#D89D59', '#DF65C6', '#C73214', '#2D93FC',
      ],
      expenseOther: '#5D685F',
      income: [
        '#2FC73A', '#029479', '#ADB834', '#1E782A',
        '#07B8AE', '#2ACD22', '#057E61', '#A0AA06',
        '#10BDB3', '#28881A', '#A0B43B', '#067459',
      ],
    },
    dark: {
      expense: [
        '#BB8D04', '#0F8FBA', '#D54685', '#7861E4',
        '#BC833D', '#CA50B2', '#C73113', '#1383EA',
      ],
      expenseOther: '#616D64',
      income: [
        '#0BB325', '#00866D', '#939D0E', '#217B2C',
        '#18A59D', '#08B300', '#018365', '#939D00',
        '#009A92', '#157B01', '#8B9F1E', '#048063',
      ],
    },
  },
  // Tierra
  earth: {
    light: {
      expense: [
        '#CA6744', '#036E9A', '#D2B12C', '#CE667A',
        '#32B1C1', '#6069C8', '#C07005', '#A94E91',
      ],
      expenseOther: '#A0AFA8',
      income: [
        '#64C250', '#038B6A', '#ADB746', '#37812F',
        '#17B7AE', '#93AA0E', '#108E6A', '#9EAA06',
        '#17B0A7', '#298131', '#ADB64F', '#076E53',
      ],
    },
    dark: {
      expense: [
        '#BE5C39', '#1575A2', '#B09200', '#C0596E',
        '#029BAB', '#5E67C5', '#B26805', '#A64B8F',
      ],
      expenseOther: '#85948D',
      income: [
        '#4FAD3A', '#017D5F', '#939C25', '#307A28',
        '#00A199', '#8AA000', '#067F5D', '#929D00',
        '#00A29A', '#227B2B', '#939C31', '#058162',
      ],
    },
  },
  // Menta
  mint: {
    light: {
      expense: [
        '#3D5BC6', '#C358A1', '#CF6922', '#8565E0',
        '#C34A7E', '#FE973B', '#0278AD', '#D84951',
      ],
      expenseOther: '#A4AAB7',
      income: [
        '#34B816', '#03A9A0', '#9AA506', '#04813C',
        '#02BDB3', '#9DB73B', '#03968E', '#A5B30B',
        '#0DA89F', '#02833B', '#A4AE1F', '#0E7F62',
      ],
    },
    dark: {
      expense: [
        '#4B6CD9', '#B84E97', '#C25D0F', '#7E5DD8',
        '#C0477C', '#DC7702', '#0B7BB0', '#CE3F49',
      ],
      expenseOther: '#8A909C',
      income: [
        '#2BAE07', '#089B93', '#939D11', '#0F853F',
        '#13AAA1', '#7A9104', '#0FA89F', '#7E8900',
        '#12AAA1', '#07853D', '#939D00', '#058364',
      ],
    },
  },
  // Rosa
  rose: {
    light: {
      expense: [
        '#E06DCA', '#D1853C', '#4C47C3', '#BF4A5C',
        '#049ED8', '#D4AF15', '#9B55A2', '#258EFE',
      ],
      expenseOther: '#63575F',
      income: [
        '#0BBE2F', '#15A299', '#ACB60B', '#037932',
        '#18B7AE', '#31CD24', '#0F8D76', '#A0AA07',
        '#16BDB3', '#268B02', '#9BB61E', '#07726B',
      ],
    },
    dark: {
      expense: [
        '#C857B4', '#BC7226', '#5856D4', '#BB4659',
        '#0A8EC2', '#B09111', '#99529F', '#0A7FEE',
      ],
      expenseOther: '#6F636B',
      income: [
        '#00B329', '#01958C', '#939D01', '#017831',
        '#02A299', '#17B304', '#058A73', '#939D01',
        '#059991', '#1F7900', '#88A100', '#00958C',
      ],
    },
  },
  // Monocromo
  mono: {
    light: {
      expense: [
        '#2864AC', '#D2834C', '#16A4B9', '#6356AF',
        '#B74E71', '#EBA240', '#AE78D1', '#B65239',
      ],
      expenseOther: '#9DA6B2',
      income: [
        '#51BB39', '#068D74', '#83B630', '#2D7F30',
        '#1AB7AE', '#61CF3A', '#05876C', '#ACB70B',
        '#11A89F', '#277D21', '#A2AD4C', '#0B765A',
      ],
    },
    dark: {
      expense: [
        '#2E69B2', '#BE7039', '#1093A6', '#675BB4',
        '#B34B6E', '#CA8411', '#9E68C0', '#B34F37',
      ],
      expenseOther: '#858E9A',
      income: [
        '#43AF2A', '#00856C', '#74A617', '#247728',
        '#179F97', '#40B000', '#07886D', '#939D00',
        '#009C94', '#1F771A', '#929C3A', '#068062',
      ],
    },
  },
  // Marino
  navy: {
    light: {
      expense: [
        '#C39912', '#02759B', '#D45053', '#4857BA',
        '#D66DA6', '#4192F7', '#E09412', '#A96BDA',
      ],
      expenseOther: '#5B616D',
      income: [
        '#38C746', '#0F9680', '#ACB607', '#02773B',
        '#2FB6AD', '#41CB33', '#01826A', '#A0AA06',
        '#14BDB3', '#24881D', '#98B722', '#05735E',
      ],
    },
    dark: {
      expense: [
        '#AA8406', '#09779D', '#CA474A', '#5060C4',
        '#C25B94', '#3082E6', '#C07E0A', '#9C5DCC',
      ],
      expenseOther: '#626873',
      income: [
        '#13B22E', '#008A75', '#939D10', '#03783C',
        '#0CA69D', '#1CB203', '#068A71', '#939D00',
        '#019991', '#0B7902', '#85A207', '#00866E',
      ],
    },
  },
  // Burdeos
  wine: {
    light: {
      expense: [
        '#A5334B', '#0295D5', '#DAAD44', '#CA67B3',
        '#D1611B', '#674FB4', '#C24A7A', '#268DE5',
      ],
      expenseOther: '#B6A5A6',
      income: [
        '#58B928', '#109176', '#ABB90F', '#367C26',
        '#10BDB3', '#46BA06', '#037959', '#A0AA06',
        '#11BDB3', '#2E8723', '#A4B252', '#087553',
      ],
    },
    dark: {
      expense: [
        '#B03C53', '#0F88C1', '#B98E19', '#B958A3',
        '#C55606', '#6B54BA', '#BC4575', '#1281D8',
      ],
      expenseOther: '#9B8B8C',
      income: [
        '#4DAE14', '#01856C', '#929D10', '#2E741D',
        '#0B9C94', '#40B000', '#04805E', '#939D00',
        '#009991', '#19770A', '#909D3C', '#087B57',
      ],
    },
  },
  // Lima
  lime: {
    light: {
      expense: [
        '#2361DD', '#C62686', '#DCAD10', '#2198CA',
        '#F4830C', '#9545D2', '#F8523C', '#6640D2',
      ],
      expenseOther: '#AFAA9C',
      income: [
        '#67C228', '#0F8B65', '#A9BA04', '#31821C',
        '#09B8AE', '#4EC601', '#088F61', '#A0AA06',
        '#0FB1A7', '#058509', '#A0BA58', '#087554',
      ],
    },
    dark: {
      expense: [
        '#2463DF', '#C32284', '#B78F0A', '#128ABA',
        '#D1700D', '#9342D0', '#E53F29', '#6B46D8',
      ],
      expenseOther: '#959082',
      income: [
        '#52A903', '#077C5A', '#8F9E06', '#1E7301',
        '#05978F', '#44AF00', '#0B7952', '#939D00',
        '#00968E', '#017405', '#87A03D', '#067B58',
      ],
    },
  },
  // Petróleo
  teal: {
    light: {
      expense: [
        '#DB682D', '#C05DB9', '#4D90F8', '#C23D60',
        '#01789C', '#D4B108', '#BB3C33', '#B068D4',
      ],
      expenseOther: '#546466',
      income: [
        '#08C644', '#039983', '#7AB90D', '#06784F',
        '#14ADA1', '#47C335', '#0A968E', '#A9B608',
        '#0FA49C', '#197C08', '#A3C039', '#087A73',
      ],
    },
    dark: {
      expense: [
        '#CB5A1A', '#B351AD', '#3D80E7', '#BF3A5D',
        '#04799D', '#B09304', '#BC3D34', '#A35BC6',
      ],
      expenseOther: '#5A6B6C',
      income: [
        '#05B23C', '#008A75', '#6DA806', '#06784F',
        '#09AA9E', '#187A03', '#029B93', '#929D02',
        '#059A92', '#167A04', '#86A100', '#00968E',
      ],
    },
  },
  // Cacao
  cocoa: {
    light: {
      expense: [
        '#3D95E9', '#A75559', '#1080AC', '#D17D18',
        '#9B63A8', '#E3A907', '#BB446A', '#727EE9',
      ],
      expenseOther: '#675C53',
      income: [
        '#51C453', '#068E6F', '#A7B730', '#2D7C2D',
        '#20B7AD', '#69CD3B', '#017F5D', '#A0AA07',
        '#0DBDB3', '#398628', '#A4B344', '#077459',
      ],
    },
    dark: {
      expense: [
        '#2A86D8', '#A65459', '#077DA9', '#BC6E09',
        '#955DA2', '#BD8C03', '#B84268', '#6771DC',
      ],
      expenseOther: '#6F645A',
      income: [
        '#3AAF3D', '#028063', '#8F9E0B', '#247524',
        '#169C94', '#49AE00', '#0C7C5B', '#939D00',
        '#009A92', '#277513', '#8F9D2C', '#068164',
      ],
    },
  },
};
