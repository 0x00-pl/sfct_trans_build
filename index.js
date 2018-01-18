let fs = require('fs')
let path = require('path')
let mongodb = require('mongodb')
let { Promise } = require('es6-promise')
let child_process = require('child_process')
let process = require('process')


function get_file_list_in_path(path, config){
    return new Promise((resolve, reject)=>{
	fs.readdir(path, (err, file_list)=>{
	    if(err) { reject(err) }
	    else { resolve(file_list) }
	})
    })
}

function get_file_list_is_dir(base_path){
    return new Promise((resolve, reject)=>{
	fs.stat(base_path, (err, stat)=>{
	    if(err) { reject(err) }
	    else { resolve(stat.isDirectory()) }
	})
    })
}

function get_file_list_in_path_rec(base_path, config){
    return get_file_list_in_path(base_path, config).then(file_list=>{
	return Promise.all(file_list.map(file_name=>{
	    let file_path = path.join(base_path, file_name)
	    return get_file_list_is_dir(file_path).then(isdir=>{
		if(isdir) { return get_file_list_in_path_rec(file_path, config) }
		else { return file_path }
	    })
	})).then(file_tree=>{
	    return Array.prototype.concat(...file_tree)
	})
    })
}

function get_file_list(base_path, config){
    "return .v file relative path base on base_path."
    return get_file_list_in_path_rec(base_path, config).then(file_list=>{
	return file_list.filter(file_path=>file_path.endsWith('.v'))
    }).then(file_list=>{
	return file_list.map(file_path=>path.relative(base_path, file_path))
    })
}

function read_file(src_path){
    return new Promise((resolve, reject)=>{
	fs.readFile(src_path, {encoding: 'utf8'}, (err, data)=>{
	    if(err){ reject(err) }
	    else { resolve(data) }
	})
    })
}
function write_file(dst_path, data){
    return new Promise((resolve, reject)=>{
	fs.writeFile(dst_path, data, (err)=>{
	    if(err) { reject(err) }
	    else { resolve(dst_path) }
	})
    })
}

function parse_file(content){
    let pos = 0
    let comment_level = 0
    let block_start = 0
    let in_string = false
    let in_comment = false
    let ret = []
    while(pos < content.length){
	let c = content[pos]
	if(in_string){
	    if(c=='"'){
		if(content[pos+1]!='"'){
		    in_string = false
		} else {
		    pos = pos + 1 // skip escape
		}
	    }
	} else {
	    if(c=='"'){
		in_string = true
	    } else if(c=='(' && content[pos+1]=='*'){
		if(comment_level==0){
		    ret.push(content.substring(block_start, pos))
		    block_start = pos
		}
		pos = pos + 1
		comment_level = comment_level + 1
	    } else if(c=='*' && content[pos+1]==')'){
		comment_level = comment_level - 1
		pos = pos + 1
		if(comment_level==0){
		    ret.push(content.substring(block_start, pos+1))
		    block_start = pos+1
		}
	    }
	}
	pos = pos + 1
    }
    if(block_start != pos) { ret.push(content.substring(block_start)) }
    return ret
}

function trans_block(origin, db){
    if(origin.startsWith('(*')){
	return db.collection('trans').find({origin}).sort({vote: -1}).limit(1).toArray().then(trans_arr=>{
	    let trans = trans_arr[0] || {vote: 0, text: origin}
	    return trans.vote>0 ? trans.text : origin
	})
    } else {
	return origin
    }
}

function trans_file(file_path, src_path, dst_path, db){
    let srcf = path.join(src_path, file_path)
    let dstf = path.join(dst_path, file_path)
    console.log('trans file: ', file_path)
    return read_file(srcf).then(content=>{
	return parse_file(content)
    }).then(block_list=>{
	return Promise.all(block_list.map(block=>trans_block(block, db)))
    }).then(transed_block_list=>write_file(dstf, transed_block_list.join(''))).then(a=>console.log('trans file done. ', file_path))
}

function make_html(dst_path){
    return new Promise((resolve, reject)=>{
	child_process.exec('make clean', {cwd: dst_path}, (err, stdout, stderr)=>{
	    if(err) {
		reject(err)
	    } else { resolve([stdout, stderr]) }
	})
    }).then(a=>{
	return new Promise((resolve, reject)=>{
	    child_process.exec('make', {cwd: dst_path}, (err, stdout, stderr)=>{
		if(err) {
		    reject(err)
		} else { resolve([stdout, stderr]) }
	    })
	})
    })
}

function connect_db(config){
    return new Promise((resolve, reject)=>{
	let pdb = mongodb.MongoClient.connect(config.mongourl, (err, db)=>{
	    if(err) {
		reject(err)
	    } else {
		if(db.collection){
		    resolve(db)
		} else {
		    let client = db
		    let real_db = client.db('test')
		    real_db.close = client.close.bind(client)
		    resolve(real_db)
		}
	    }
	})
    })
}

function reinit_db_remove_book_chapter_block(db){
    return db.collection('block').remove({})
	.then(a=>db.collection('chapter').remove({}))
	.then(a=>db.collection('book').remove({}))
}

function reinit_db_insert_block(db, chapter_id, origin){
    let block = {chapter_id, origin, status: 'unverified', trans_list: []}

    return db.collection('block').insertOne(block).then(a=>{
	return db.collection('chapter').updateOne(
	    {_id: chapter_id},
	    {$addToSet: {block_list: block._id}}
	)
    })
}

function reinit_db_insert_chapter(db, book_id, chapter_file_path){
    let name = chapter_file_path.split('/').pop()
    let chapter = {book_id, name, block_list: []}

    console.log('insert chapter: ', name)
    return db.collection('chapter').insertOne(chapter).then(a=>{
	return db.collection('book').updateOne(
	    {_id: book_id},
	    {$addToSet: {chapter_list: chapter._id}}
	)
    }).then(a=>{
	return read_file(chapter_file_path).then(content=>{
	    return parse_file(content)
	})
    }).then(origin_list=>Promise.all(
	origin_list.map(origin=>reinit_db_insert_block(db, chapter._id, origin))
    )).then(a=>console.log('insert chapter done. ', name))
}

function reinit_db_insert_book(db, book_path, config){
    while(book_path.endsWith('/')) { book_path = book_path.substr(0, book_path.length-1) }
    let name = book_path.split('/').pop()
    let book = {name, chapter_list: []}
    console.log('insert book: ', name)
    return get_file_list(book_path, config).then(file_list=>{
	return db.collection('book').insertOne(book).then(a=>Promise.all(
	    file_list.map(file_path=>reinit_db_insert_chapter(db, book._id, path.join(book_path, file_path)))
	))
    }).then(a=>console.log('insert book done. ', name))
}

function reinit_db_insert_book_list(db, src_path, config){
    let book_path_list = config.book_path_list
    return Promise.all(
	book_path_list.map(book_path=>reinit_db_insert_book(db, path.join(src_path, book_path), config))
    )
}

function reinit_db_fix_trans_block_block(db, trans){
    return db.collection('block').updateMany(
	{origin: trans.origin},
	{$addToSet: {trans_list: trans._id}}
    )
}

function reinit_db_fix_trans_block_id(db){
    console.log('fixing trans.block_id.')
    let debug_count = 0
    let debug_total = 0
    return db.collection('trans').find().toArray().then(trans_list=>{
	debug_total = trans_list.length
	console.log('get trans_list done. length: ', trans_list.length)
	return Promise.all(trans_list.map(trans=>{
	    return reinit_db_fix_trans_block_block(db, trans).then(a=>{
		debug_count++
		if(debug_count % 100 == 0){
		    console.log(`fixed count: ${debug_count} / ${debug_total}`)
		}
	    })
	}))
    }).then(a=>console.log('fixing trand.block_id done.'))
}

function reinit_db(db, src_path, config){
    return reinit_db_remove_book_chapter_block(db).then(a=>{
	return reinit_db_insert_book_list(db, src_path, config)
    }).then(a=>{
	return reinit_db_fix_trans_block_id(db)
    })
}

function init(src_path, config){
    return connect_db(config).then(db=>{
	return reinit_db(db, src_path, config).then(a=>db.close())
    })
}

function trans_path(db, src_path, dst_path, trans_path, config){
    let src_trans_path = path.join(src_path, trans_path)
    let dst_trans_path = path.join(dst_path, trans_path)
    return get_file_list(src_trans_path, config).then(file_list=>{
	console.log('start trans: ', trans_path)
	return Promise.all(file_list.map(file_path=>{
	    return trans_file(file_path, src_trans_path, dst_trans_path, db)
	}))
    }).then(a=>{
	return console.log('trans done. start make. ', trans_path)
    }).then(a=>make_html(dst_trans_path)).then(a=>{
	return console.log('make done. ', trans_path)
    })
}

function trans(src_path, dst_path, config){
    return connect_db(config).then(db=>{
	let trans_path_list = config.trans_path_list || [src_path]
	return Promise.all(trans_path_list.map(path_to_trans=>{
	    return trans_path(db, src_path, dst_path, path_to_trans, config)
	})).then(a=>db.close())
    }).then(a=>console.log('all done.')).catch(console.log)
}

function try_read(filename){
    try{
	let content = fs.readFileSync(filename, {encoding: 'utf8'})
	return JSON.parse(content)
    }catch(err){
	return {}
    }
}

function load_config(){
    return Object.assign(
	{
	    mongourl: 'mongodb://localhost/test',
	    src_path: path.join(__dirname, './sf_src'),
	    dst_path: path.join(__dirname, './sf_dst'),
	    book_path_list: [
		'./new/sf'
	    ],
	    trans_path_list: [
		'./new'
	    ]
	},
	try_read(path.join(__dirname, './deployment_config/config.json')),
	try_read(path.join(__dirname, './deployment_config/mongodb.json'))
    )
}

function main(){
    let config = load_config()
    return Promise.resolve(trans(config.src_path, config.dst_path, config))
}

module.exports = {
    init,
    main
}

if(process.argv[2] == "trans"){
    main()
} else if(process.argv[2] == "init"){
    let config = load_config()
    init(config.src_path, config).then(a=>console.log('all done.')).catch(console.log)
}
