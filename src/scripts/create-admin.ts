import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Admin } from '../models/Admin';
import * as readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function createAdmin(): Promise<void> {
  try {
    // Connexion à MongoDB
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('❌ MONGO_URI non défini dans .env');
      process.exit(1);
    }

    console.log('🔄 Connexion à MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');

    // Demander les informations de l'admin
    console.log('📝 Création d\'un nouveau compte administrateur\n');

    const username = await question('Nom d\'utilisateur: ');
    if (!username || username.length < 3) {
      console.error('❌ Le nom d\'utilisateur doit contenir au moins 3 caractères');
      process.exit(1);
    }

    // Vérifier si le username existe déjà
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      console.error('❌ Ce nom d\'utilisateur existe déjà');
      process.exit(1);
    }

    const email = await question('Email: ');
    if (!email || !email.includes('@')) {
      console.error('❌ Email invalide');
      process.exit(1);
    }

    const password = await question('Mot de passe (min 6 caractères): ');
    if (!password || password.length < 6) {
      console.error('❌ Le mot de passe doit contenir au moins 6 caractères');
      process.exit(1);
    }

    const roleInput = await question('Rôle (admin/super_admin) [admin]: ');
    const role = roleInput.trim() === 'super_admin' ? 'super_admin' : 'admin';

    // Créer l'admin
    const admin = new Admin({
      username,
      email,
      password,
      role,
      isActive: true,
    });

    await admin.save();

    console.log('\n✅ Compte administrateur créé avec succès !');
    console.log(`   Nom d'utilisateur: ${username}`);
    console.log(`   Email: ${email}`);
    console.log(`   Rôle: ${role}`);
    console.log('\n🔗 Vous pouvez maintenant vous connecter sur: http://localhost:3000/admin/login');
  } catch (error) {
    console.error('❌ Erreur lors de la création du compte:', error);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.connection.close();
  }
}

createAdmin();
