const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const stripe = require("stripe")(process.env.STRIPE_SCREET_KEY);


const port = process.env.PORT || 5000;


// Middle-wear
app.use(cors())
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ts14m7y.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('Unauthorized access')
    }
    const token = authHeader.split(' ')[1]

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded;

        next()
    })

}


async function run(){
    try{
        const productsCollection = client.db('BookSeller').collection('products');
        const categoriesCollection = client.db('BookSeller').collection('categories');
        const usersCollection = client.db('BookSeller').collection('users');
        const locationsCollection = client.db('BookSeller').collection('locations');
        const ordersCollection = client.db('BookSeller').collection('orders');
        const paymentsCollection = client.db('BookSeller').collection('payments')


        // NOTE: make sure you use verifyAdmin after verifyJWT
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        const verifySeller = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'seller') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }


        // CATEGORY
        app.get('/categories', async(req, res)=>{
            const query = {}
            const result = await categoriesCollection.find(query).toArray();
            res.send(result)
        })

        app.get('/category/:id', async(req, res)=>{
            const id = req.params.id;
            const query = {_id : ObjectId(id)}
            const result = await categoriesCollection.findOne(query);
            res.send(result)
        })


        app.post('/products', async(req, res)=>{
            const car = req.body;
            const result = await productsCollection.insertOne(car);
            res.send(result)

        })

        app.get('/product/:id', async(req, res)=>{
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await productsCollection.findOne(filter);
            res.send(result)
            console.log(result)
        })

        app.get('/products/id',async(req, res)=>{
            const query = req.query?.id;
            const category = {categoryId : query}
            const result = await productsCollection.find(category).toArray();
            res.send(result)
        })

        app.get('/products',async(req, res)=>{
            const category = {}
            const result = await productsCollection.find(category).toArray();
            res.send(result)
        })

        app.get('/products/my-products',verifyJWT, async(req, res)=>{
            // let query = {};
            // if(req.query.email){
            //     query = {email: req.query?.email}
            // }
            const email = req.query.email;
            const query = {email: email}
            const result = await productsCollection.find(query).toArray();
            res.send(result)
        })

        app.delete('/products/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await productsCollection.deleteOne(filter);
            res.send(result);
            console.log(result)
        })


        app.post('/orders', async(req, res)=>{
            const query = req.body;
            const result = await ordersCollection.insertOne(query);
            res.send(result);
            console.log(result)
        })


        app.get('/orders', async(req,res)=>{
            const email = req.query.email;
            const query = {email : email}
            const result = await ordersCollection.find(query).toArray();
            res.send(result)
        })


        app.get('/orders/mybuyer', verifyJWT, verifySeller,  async(req,res)=>{
            const email = req.query.email;
            const query = {seller_email : email}
            const result = await ordersCollection.find(query).toArray();
            res.send(result)
        })

        // Payment 
        app.get('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await ordersCollection.findOne(query)
            res.send(result)


        })

        app.post('/create-payment', async (req, res) => {
            const order = req.body;
            const price = order.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                "payment_method_types": [
                    "card"
                ],
            })

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })


        app.post('/payments', async (req, res) => {
            const payment = req.body;
            console.log(payment)
            const result = await paymentsCollection.insertOne(payment);

            const id = payment.orderId;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId,
                }
            }

            const updatedResult = await ordersCollection.updateOne(filter, updatedDoc)
            console.log(updatedResult)
            res.send(result)
        })


        // Location
        app.get('/locations', async(req, res)=> {
            const query = {};
            const location = await locationsCollection.find(query).toArray();
            res.send(location);
        })


        // JWT TOKEN
        app.get('/jwt', async(req, res)=>{
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' })
        })



        // USER 
        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    verified: 'verified'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        });

        

        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log(user);
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });
        
        app.get('/users', async (req, res) => {
            const user = {}
            const result = await usersCollection.find(user).toArray();
            res.send(result);
        });

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            console.log(query)
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })


        // Seller API
        app.get('/users/seller/:email',  async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isSeller: user?.role === 'seller' });
        })


        app.get('/users/verified/seller',  async (req, res) => {
            const email = req.query.email;
            const query = {email: email}
            const seller = await usersCollection.findOne(query);
            res.send(seller);
            console.log(seller)
        })


        app.get('/users/seller', verifyJWT, verifyAdmin, async (req, res) => {
            const role = req.query.role;
            const query = { role : role}
            const seller = await usersCollection.find(query).toArray();
            res.send(seller);
        })

        app.delete('/users/seller/:id', verifyJWT, verifyAdmin, async(req, res)=>{
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(filter);
            res.send(result);
        })

        // Buyer Api
        app.get('/users/buyer/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isBuyer: user?.role === 'buyer' });
        })

        app.get('/users/buyer', verifyJWT, verifyAdmin, async (req, res) => {
            const role = req.query.role;
            const query = { role : role}
            const buyer = await usersCollection.find(query).toArray();
            res.send(buyer);
        })


        app.delete('/users/buyer/:id', verifyJWT, verifyAdmin, async(req, res)=>{
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(filter);
            console.log(result);
        })



    }

    finally{

    }
}

run().catch(error => console.log(error))



app.get('/', (req, res)=>{
    res.send("Book seller server is running")
})

app.listen(port, ()=>{
    console.log(`Book seller server is running on ${port}`)
})



