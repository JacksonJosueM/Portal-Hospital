const { poolPromise, sql } = require('../config/db');

const OtpModel = {
  // Ahora recibe un objeto paciente con toda la data
  async crear(paciente) {
    const pool = await poolPromise;
    const codigo = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digitos
    
    // Insertamos adaptándonos a la tabla codigos_otp personalizada del usuario
    await pool.request()
      .input('tipo_doc', sql.VarChar(10), paciente.tipo_documento)
      .input('num_doc', sql.VarChar(30), paciente.numero_documento)
      .input('fecha_nac', sql.Date, paciente.fecha_nacimiento || null)
      .input('codigo', sql.VarChar(6), codigo)
      .input('correo', sql.VarChar(150), paciente.correo || '')
      .query(`
        INSERT INTO codigos_otp 
        (tipo_documento, numero_documento, fecha_nacimiento, codigo_otp, email_destino, expiracion, usado, fecha_creacion)
        VALUES 
        (@tipo_doc, @num_doc, @fecha_nac, @codigo, @correo, DATEADD(minute, 5, GETDATE()), 0, GETDATE())
      `);
      
    return codigo;
  },

  async verificar(paciente, codigo_otp) {
    const pool = await poolPromise;
    
    // Obtener el registro OTP activo del paciente
    const result = await pool.request()
      .input('tipo_doc', sql.VarChar(10), paciente.tipo_documento)
      .input('num_doc', sql.VarChar(30), paciente.numero_documento)
      .query(`
        SELECT top 1 id, codigo_otp, intentos, bloqueado
        FROM codigos_otp 
        WHERE tipo_documento = @tipo_doc 
          AND numero_documento = @num_doc 
          AND usado = 0 
          AND expiracion > GETDATE()
        ORDER BY id DESC
      `);
      
    if (result.recordset.length === 0) {
      return { valido: false, error: 'Has superado el máximo de intentos. Debes solicitar un nuevo código.', intentosRestantes: 0 };
    }

    const rec = result.recordset[0];
    
    if (rec.bloqueado === 1 || rec.bloqueado === true) {
       return { valido: false, error: 'Has superado el máximo de intentos posibles. Por favor espera y solicita un código nuevo.', intentosRestantes: 0 };
    }

    if (rec.codigo_otp === codigo_otp) {
       // Éxito
       await pool.request()
         .input('id', sql.Int, rec.id)
         .query('UPDATE codigos_otp SET usado = 1, fecha_uso = GETDATE() WHERE id = @id');
       return { valido: true };
    } else {
       // Fallo
       const nuevosIntentos = (rec.intentos || 0) + 1;
       const bloquear = nuevosIntentos >= 3 ? 1 : 0;
       await pool.request()
         .input('id', sql.Int, rec.id)
         .input('intentos', sql.Int, nuevosIntentos)
         .input('bloqueado', sql.Bit, bloquear)
         .query('UPDATE codigos_otp SET intentos = @intentos, bloqueado = @bloqueado WHERE id = @id');
         
       if (bloquear === 1) {
          return { valido: false, error: 'Has agotado los 3 intentos. El acceso ha sido bloqueado temporalmente. Solicita uno nuevo.', intentosRestantes: 0 };
       } else {
          return { valido: false, error: `Código incorrecto.`, intentosRestantes: 3 - nuevosIntentos };
       }
    }
  }
};

module.exports = OtpModel;
