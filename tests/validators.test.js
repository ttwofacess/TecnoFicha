import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../js/utils.js';

/**
 * sanitize* / validate* son puros (no tocan el DOM), así que van sin jsdom.
 * Los validadores devuelven el mensaje de error o null si el valor está bien.
 */
describe('sanitize y validate de los campos', () => {
  describe('esc (escapado de HTML)', () => {
    test('escapa lo que puede romper el markup', () => {
      assert.equal(u.esc('<script>alert("x")&\'y\'</script>'),
        '&lt;script&gt;alert(&quot;x&quot;)&amp;\'y\'&lt;/script&gt;');
    });

    test('tolera null/undefined y no toca texto plano', () => {
      assert.equal(u.esc(null), '');
      assert.equal(u.esc(undefined), '');
      assert.equal(u.esc('Juan Pérez'), 'Juan Pérez');
    });
  });

  describe('nombre', () => {
    test('deja letras, tildes, ñ, guion, apóstrofo y punto', () => {
      assert.equal(u.sanitizeNameInput("María-José O'Neill Jr."), "María-José O'Neill Jr.");
    });

    test('saca dígitos y símbolos, y colapsa espacios', () => {
      assert.equal(u.sanitizeNameInput('J3uan!   Pérez'), 'Juan Pérez');
    });

    test('corta a 80 caracteres', () => {
      assert.equal(u.sanitizeNameInput('a'.repeat(200)).length, 80);
    });

    test('exige nombre', () => {
      assert.equal(u.validateName(''), 'El nombre es obligatorio.');
      assert.equal(u.validateName('   '), 'El nombre es obligatorio.');
      assert.equal(u.validateName('123'), 'El nombre es obligatorio.', 'los dígitos se limpian antes de validar');
    });

    test('exige mínimo 2 caracteres', () => {
      assert.equal(u.validateName('a'), 'El nombre debe tener al menos 2 caracteres.');
    });

    test('exige al menos una letra', () => {
      assert.equal(u.validateName('...'), 'El nombre debe contener letras.');
    });

    test('rechaza un caracter repetido', () => {
      assert.equal(u.validateName('aaaaaaa'), 'Ingresá un nombre válido.');
    });

    test('acepta un nombre real', () => {
      assert.equal(u.validateName('Juan Pérez'), null);
    });
  });

  describe('ciudad', () => {
    test('conserva puntos y paréntesis', () => {
      assert.equal(u.sanitizeCityInput('Gral. Roca (GBA)'), 'Gral. Roca (GBA)');
    });

    test('es obligatoria y de 2 caracteres mínimo', () => {
      assert.equal(u.validateCity(''), 'La ciudad es obligatoria.');
      assert.equal(u.validateCity('a'), 'La ciudad debe tener al menos 2 caracteres.');
      assert.equal(u.validateCity('Rosario'), null);
    });
  });

  describe('provincia', () => {
    test('descarta etiquetas HTML', () => {
      assert.equal(u.sanitizeProvinceInput('<b>Buenos Aires</b>'), 'bBuenos Airesb');
    });

    test('es obligatoria y acepta nombres con tilde', () => {
      assert.equal(u.validateProvince(''), 'La provincia es obligatoria.');
      assert.equal(u.validateProvince('23'), 'La provincia es obligatoria.');
      assert.equal(u.validateProvince('Córdoba'), null);
    });
  });

  describe('filtro de provincia (select)', () => {
    test('deja pasar nombres con tildes y guiones', () => {
      assert.equal(u.sanitizeProvinceFilter('Buenos Aires'), 'Buenos Aires');
      assert.equal(u.sanitizeProvinceFilter('Santa Fe'), 'Santa Fe');
    });

    test('cualquier cosa raro cae en "todas"', () => {
      assert.equal(u.sanitizeProvinceFilter('<script>'), '');
      assert.equal(u.sanitizeProvinceFilter('Córdoba;'), '', 'punto y coma no pertenece a una provincia');
    });
  });

  describe('marca (obligatoria)', () => {
    test('no deja pasar etiquetas', () => {
      assert.doesNotMatch(u.sanitizeMarcaInput('HP <b>ProBook</b>'), /[<>]/);
    });

    test('es obligatoria y de 2 caracteres mínimo', () => {
      assert.equal(u.validateMarca(''), 'La marca es obligatoria.');
      assert.equal(u.validateMarca('H'), 'La marca debe tener al menos 2 caracteres.');
      assert.equal(u.validateMarca('HP'), null);
      assert.equal(u.validateMarca('ASUS'), null);
    });

    test('rechaza un caracter repetido', () => {
      assert.equal(u.validateMarca('aa'), 'Ingresa una marca valida.');
    });
  });

  describe('campos opcionales (modelo, cpu, gpu, discos)', () => {
    test('vacíos pasan siempre', () => {
      for (const validate of [u.validateModelo, u.validateCpu, u.validateGpu, u.validateDiscos, u.validateTareas]) {
        assert.equal(validate(''), null);
      }
    });

    test('pero no pueden ser solo símbolos', () => {
      assert.equal(u.validateModelo('###'), 'El modelo debe contener letras o numeros.');
      assert.equal(u.validateCpu('---'), 'El CPU debe contener letras o numeros.');
      assert.equal(u.validateGpu('///'), 'El GPU debe contener letras o numeros.');
      assert.equal(u.validateDiscos('+++'), 'El almacenamiento debe contener letras o números.');
    });

    test('aceptan valores normales', () => {
      assert.equal(u.validateModelo('EliteBook 840'), null);
      assert.equal(u.validateCpu('Ryzen 5 3600'), null);
      assert.equal(u.validateDiscos('SSD 500GB NVMe'), null);
    });

    test('tareas pide 3 caracteres si se completa', () => {
      assert.equal(u.validateTareas('ab'), 'Describí las tareas con al menos 3 caracteres.');
      assert.equal(u.validateTareas('Cambio de pasta'), null);
    });
  });

  describe('ram', () => {
    test('deja solo dígitos', () => {
      assert.equal(u.sanitizeRamInput('16 GB'), '16');
      assert.equal(u.sanitizeRamInput('3.5'), '35');
    });

    test('es opcional y valida enteros', () => {
      assert.equal(u.validateRam(''), null);
      assert.equal(u.validateRam('16'), null);
    });

    test('con 5 dígitos el valor máximo', () => {
      // Ojo: sanitizeRamInput corta a 5 caracteres, así que el rango "mayor a
      // 99999" de validateRam es inalcanzable. El test lo deja documentado.
      assert.equal(u.validateRam('99999'), null);
      assert.equal(u.sanitizeRamInput('999999'), '99999');
    });
  });

  describe('fecha', () => {
    test('acepta una fecha ISO real', () => {
      assert.equal(u.sanitizeFechaInput('2024-03-05'), '2024-03-05');
      assert.equal(u.validateFecha('2024-03-05'), null);
    });

    test('rechaza fechas que no existen', () => {
      assert.equal(u.sanitizeFechaInput('2024-02-30'), '');
      assert.equal(u.sanitizeFechaInput('2023-02-29'), '', '2023 no es bisiesto');
      assert.equal(u.sanitizeFechaInput('05/03/2024'), '');
    });

    test('acepta 29/02 en año bisiesto', () => {
      assert.equal(u.sanitizeFechaInput('2024-02-29'), '2024-02-29');
    });

    test('es obligatoria', () => {
      assert.equal(u.validateFecha(''), 'La fecha de consulta es obligatoria.');
    });
  });

  describe('teléfono', () => {
    test('deja dígitos y un + inicial', () => {
      assert.equal(u.sanitizeTelInput('+54 11 1234-5678'), '+541112345678');
      assert.equal(u.sanitizeTelInput('11 1234 5678'), '1112345678');
    });

    test('es opcional pero debe tener 8 a 15 dígitos', () => {
      assert.equal(u.validateTel(''), null);
      assert.equal(u.validateTel('1234567'), 'Teléfono inválido. Debe contener entre 8 y 15 dígitos y puede iniciar con +.');
      assert.equal(u.validateTel('+54112345678'), null);
    });
  });

  describe('problema (obligatorio)', () => {
    test('saca caracteres que rompen HTML', () => {
      assert.doesNotMatch(u.sanitizeProblemaInput('no <b>prende</b> "nada"'), /[<>"`\\]/);
    });

    test('pide al menos 5 caracteres', () => {
      assert.equal(u.validateProblema(''), 'El problema es obligatorio.');
      assert.equal(u.validateProblema('abcd'), 'Describí el problema con al menos 5 caracteres.');
      assert.equal(u.validateProblema('no prende'), null);
    });
  });

  describe('cobrado', () => {
    test('deja dígitos y un solo punto', () => {
      assert.equal(u.sanitizeCobradoInput('1.234,56'), '1.23456');
      assert.equal(u.sanitizeCobradoInput('$ 500'), '500');
    });

    test('es opcional', () => {
      assert.equal(u.validateCobrado(''), null);
      assert.equal(u.validateCobrado('500'), null);
      assert.equal(u.validateCobrado('1500.75'), null);
    });

    test('rechaza montos absurdos', () => {
      assert.equal(u.validateCobrado('999999999999'), 'El monto cobrado parece demasiado alto.');
    });
  });

  describe('formatDate', () => {
    test('pasa de ISO a dd/mm/aaaa', () => {
      assert.equal(u.formatDate('2024-03-05'), '05/03/2024');
    });

    test('devuelve vacío sin fecha', () => {
      assert.equal(u.formatDate(''), '');
      assert.equal(u.formatDate(null), '');
    });
  });
});