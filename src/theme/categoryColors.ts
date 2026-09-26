import type { ColorPaletteId } from './index';

// Colores de las categorías de cada paleta, con un juego para modo claro y otro
// para oscuro (en oscuro, todos con al menos 3:1 de contraste sobre la tarjeta).
//
// - Gastos: 12 colores, uno fijo para cada categoría (ver utils/categoryColors),
//   más un gris con un toque de la paleta para "Otros". Los 8 primeros son uno
//   de cada familia (rojo, naranja, amarillo, marrón, azul, celeste, morado y
//   rosa), con el matiz de la paleta; el primero, de Hogar, es su color
//   característico. Los 4 últimos, para la 3.ª a 6.ª categoría propia, son
//   tonos más claros u oscuros de esas familias. Se distinguen todas las
//   parejas, no solo las que quedan juntas en el gráfico, también simulando
//   daltonismo. Ninguno es verde ni turquesa: esos tonos quedan para los
//   ingresos, para no confundirlos.
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
        '#E6AC3D', '#215DA5', '#AE6626', '#6861F1',
        '#633C2E', '#51A3CC', '#8B397C', '#F68390',
        '#DC428A', '#DD7EF6', '#A845CC', '#B6303E',
      ],
      expenseOther: '#5A6F5F',
      income: [
        '#2FC73A', '#029479', '#ADB834', '#1E782A',
        '#07B8AE', '#2ACD22', '#057E61', '#A0AA06',
        '#10BDB3', '#28881A', '#A0B43B', '#067459',
      ],
    },
    dark: {
      expense: [
        '#C38D36', '#4278AD', '#FAB18A', '#6F5DD7',
        '#B35537', '#52B3D1', '#A94F8D', '#F06F80',
        '#F686F4', '#A67DF2', '#D936AE', '#D43063',
      ],
      expenseOther: '#5D6E60',
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
        '#CB653E', '#A42741', '#E3B572', '#623F0B',
        '#215DA5', '#4CA0DC', '#6F5EF0', '#D166AF',
        '#F68486', '#A21F8F', '#925B0C', '#DF3068',
      ],
      expenseOther: '#717674',
      income: [
        '#64C250', '#038B6A', '#ADB746', '#37812F',
        '#17B7AE', '#93AA0E', '#108E6A', '#9EAA06',
        '#17B0A7', '#298131', '#ADB64F', '#076E53',
      ],
    },
    dark: {
      expense: [
        '#BD5834', '#F7A3AA', '#E4C969', '#D98943',
        '#98AEF1', '#2890C4', '#6F5DD7', '#BA54A1',
        '#F5558F', '#EF57D6', '#CEAF33', '#CD285E',
      ],
      expenseOther: '#6C706E',
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
        '#3A5FC9', '#F68390', '#AC6721', '#DAB060',
        '#5F3E34', '#58A9D3', '#8D3879', '#9572E7',
        '#D3316A', '#AF2D18', '#C85EB4', '#E4752E',
      ],
      expenseOther: '#6C7487',
      income: [
        '#34B816', '#03A9A0', '#9AA506', '#04813C',
        '#02BDB3', '#9DB73B', '#03968E', '#A5B30B',
        '#0DA89F', '#02833B', '#A4AE1F', '#0E7F62',
      ],
    },
    dark: {
      expense: [
        '#5071DE', '#E62E23', '#F48A64', '#EBD070',
        '#9C6F53', '#3AB1E8', '#AD5697', '#E1B8F9',
        '#F764CB', '#F36A8A', '#D33ABB', '#D8732B',
      ],
      expenseOther: '#9598A0',
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
        '#E16DC8', '#B92848', '#1855C1', '#F06A2A',
        '#623F0B', '#35A1E7', '#79438E', '#D5BD67',
        '#8C67F2', '#E29098', '#B747A4', '#B0652A',
      ],
      expenseOther: '#7D797B',
      income: [
        '#0BBE2F', '#15A299', '#ACB60B', '#037932',
        '#18B7AE', '#31CD24', '#0F8D76', '#A0AA07',
        '#16BDB3', '#268B02', '#9BB61E', '#07726B',
      ],
    },
    dark: {
      expense: [
        '#CB5AB6', '#F7A3AA', '#3E8BD1', '#F5642B',
        '#976851', '#60C8DD', '#705ADC', '#DAB249',
        '#959AF4', '#E2406F', '#F5ADF9', '#C8875A',
      ],
      expenseOther: '#A999A3',
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
        '#2A63AB', '#F68390', '#B56124', '#DDAF61',
        '#5F3F33', '#52A9D9', '#7567F1', '#883C7A',
        '#C861AD', '#C32853', '#5B3ACB', '#F76EDE',
      ],
      expenseOther: '#767B82',
      income: [
        '#51BB39', '#068D74', '#83B630', '#2D7F30',
        '#1AB7AE', '#61CF3A', '#05876C', '#ACB70B',
        '#11A89F', '#277D21', '#A2AD4C', '#0B765A',
      ],
    },
    dark: {
      expense: [
        '#3A75BF', '#F7A3AA', '#F5642B', '#CCB76A',
        '#976851', '#4FBADE', '#714FF1', '#A55095',
        '#D667F3', '#EA306D', '#8680D1', '#F793F5',
      ],
      expenseOther: '#8E939A',
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
        '#BF8F34', '#5E3F30', '#E29098', '#C55123',
        '#2954BC', '#3096CB', '#893F71', '#815AE4',
        '#E046A4', '#B199F4', '#D3BD70', '#C468F2',
      ],
      expenseOther: '#737478',
      income: [
        '#38C746', '#0F9680', '#ACB607', '#02773B',
        '#2FB6AD', '#41CB33', '#01826A', '#A0AA06',
        '#14BDB3', '#24881D', '#98B722', '#05735E',
      ],
    },
    dark: {
      expense: [
        '#C28D36', '#B35537', '#F56A7E', '#FAB18A',
        '#4A64E7', '#539AC9', '#EDACDE', '#9953AB',
        '#E965F2', '#8079D0', '#CEAF33', '#BB60F4',
      ],
      expenseOther: '#67696C',
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
        '#A7344A', '#F5642B', '#E3B842', '#5F4118',
        '#256292', '#50A1D5', '#6A37BF', '#EB59B0',
        '#A267F0', '#E2909B', '#AB2590', '#905C06',
      ],
      expenseOther: '#857677',
      income: [
        '#58B928', '#109176', '#ABB90F', '#367C26',
        '#10BDB3', '#46BA06', '#037959', '#A0AA06',
        '#11BDB3', '#2E8723', '#A4B252', '#087553',
      ],
    },
    dark: {
      expense: [
        '#BB475D', '#F06A2A', '#CCAE63', '#A06602',
        '#297CEF', '#6CB4E3', '#7D5CC7', '#D967C4',
        '#8D8AF1', '#F996A9', '#BB29A6', '#F1CF4B',
      ],
      expenseOther: '#908B8B',
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
        '#2B63E0', '#F68390', '#6B3724', '#DAA850',
        '#9477DD', '#B56124', '#903081', '#5BA8D4',
        '#DB3E98', '#6A37BF', '#BA2842', '#2783B2',
      ],
      expenseOther: '#6A6965',
      income: [
        '#67C228', '#0F8B65', '#A9BA04', '#31821C',
        '#09B8AE', '#4EC601', '#088F61', '#A0AA06',
        '#0FB1A7', '#058509', '#A0BA58', '#087554',
      ],
    },
    dark: {
      expense: [
        '#2C6BE7', '#F7A3AA', '#936A4A', '#CEB660',
        '#898EE7', '#F5642B', '#A94F8D', '#3EC9F5',
        '#EC52C0', '#7461C6', '#EB3065', '#3D96C6',
      ],
      expenseOther: '#9B9890',
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
        '#D86728', '#D3BD70', '#AE2845', '#2E5E9A',
        '#623F0B', '#35A1E7', '#D86CB5', '#7640D2',
        '#8676F2', '#966212', '#E3928A', '#E73966',
      ],
      expenseOther: '#7C8182',
      income: [
        '#08C644', '#039983', '#7AB90D', '#06784F',
        '#14ADA1', '#47C335', '#0A968E', '#A9B608',
        '#0FA49C', '#197C08', '#A3C039', '#087A73',
      ],
    },
    dark: {
      expense: [
        '#CC5825', '#E8C869', '#F7A3AA', '#2A8EEF',
        '#C19469', '#5BC1D9', '#AA4C93', '#6461DA',
        '#A392D6', '#F77132', '#EC4F8F', '#CE2857',
      ],
      expenseOther: '#656A6A',
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
        '#4296EA', '#E29098', '#5F3E34', '#C55123',
        '#237FA4', '#E1AF4A', '#4F45C4', '#93356D',
        '#9857E7', '#CF399E', '#F668C3', '#D5812D',
      ],
      expenseOther: '#948374',
      income: [
        '#51C453', '#068E6F', '#A7B730', '#2D7C2D',
        '#20B7AD', '#69CD3B', '#017F5D', '#A0AA07',
        '#0DBDB3', '#398628', '#A4B344', '#077459',
      ],
    },
    dark: {
      expense: [
        '#2983D5', '#EB4766', '#A06522', '#E78B2E',
        '#54BBD2', '#F1CF4B', '#6A55EE', '#F599A6',
        '#A24FA0', '#D279F3', '#CA40CA', '#F5AB77',
      ],
      expenseOther: '#8F8B88',
      income: [
        '#3AAF3D', '#028063', '#8F9E0B', '#247524',
        '#169C94', '#49AE00', '#0C7C5B', '#939D00',
        '#009A92', '#277513', '#8F9D2C', '#068164',
      ],
    },
  },
};
